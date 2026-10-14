/**
 * The renderer. One canvas, one quad, one shader at a time.
 *
 * Everything here exists to make a decorative background cost nothing when it
 * is not being looked at:
 *
 * - The device pixel ratio is capped. A 3x phone screen would otherwise ask a
 *   mid-range GPU for nine times the fragments, for a full-screen effect
 *   sitting behind opaque panels at low contrast. Nobody can see the
 *   difference; the battery can.
 * - Frames are rate-limited. These effects move slowly by design and none of
 *   them looks better at 60fps than at 40.
 * - A hidden tab stops entirely, and `uTime` stops with it — so a background
 *   left in a tab overnight resumes where it was rather than jumping.
 * - `prefers-reduced-motion` renders exactly one frame and then stops. The
 *   look survives; the motion does not. Turning the effect off completely
 *   would be a different, worse answer: the hunter chose this background.
 *
 * If WebGL is missing or the context is lost, `start` returns null and the
 * caller removes the canvas. The ground wash underneath is a complete design
 * on its own, which is what makes that an acceptable outcome rather than a
 * broken screen.
 */

import type { Palette } from './palette'
import type { BackgroundId } from './registry'
import { VERTEX_SHADER, fragmentShaderFor } from './shaders'

const MAX_DPR = 1.5
/**
 * Full-screen default. These effects move slowly by design and none of them
 * looks better at 60fps than at 40. The picker's thumbnails pass something
 * lower still — six of them are on screen at once and each has its own context.
 */
const DEFAULT_FPS = 40

/**
 * Canvases with a context release pending.
 *
 * `destroy` frees the GL context outright rather than waiting for the canvas to
 * be collected: the picker puts six contexts on screen at once, browsers cap
 * how many may exist, and a page that leaks them starts having live ones killed
 * underneath it.
 *
 * But `loseContext` is permanent. `getContext` on that canvas hands back the
 * same dead context forever, every shader compiled against it fails with a null
 * info log, and `start` returns null — which reads as the hunter having chosen
 * "Still". React's development double-invoke does exactly that: mount, destroy,
 * then mount again on the *same* element, so the background was off on every
 * page load in dev, behind two unexplained warnings.
 *
 * So the release is deferred by a task and cancelled if the same canvas is
 * started again before it runs. A real teardown still frees the context a task
 * later; a remount keeps the one it already has.
 */
const pendingRelease = new WeakMap<HTMLCanvasElement, ReturnType<typeof setTimeout>>()

export interface BackgroundHandle {
  /** Swap effects without rebuilding the context. Null tears the shader down. */
  setEffect(id: BackgroundId): void
  setPalette(palette: Palette): void
  /** Follow the media query live, so toggling the OS setting takes effect. */
  setReducedMotion(reduced: boolean): void
  /** Freeze. `uTime` stops advancing, so resuming does not jump. */
  pause(): void
  resume(): void
  destroy(): void
}

interface Uniforms {
  resolution: WebGLUniformLocation | null
  time: WebGLUniformLocation | null
  ground: WebGLUniformLocation | null
  accent: WebGLUniformLocation | null
  accentBright: WebGLUniformLocation | null
  craft: WebGLUniformLocation | null
  strength: WebGLUniformLocation | null
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // Worth saying out loud: a silent failure here looks identical to the
    // hunter having chosen "Still", and would be very hard to tell apart.
    console.warn('[background] shader failed to compile:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function link(gl: WebGLRenderingContext, fragmentSource: string): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!vs || !fs) {
    if (vs) gl.deleteShader(vs)
    if (fs) gl.deleteShader(fs)
    return null
  }

  const program = gl.createProgram()
  if (!program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)

  // The shader objects are only needed to link; the program holds what it needs.
  gl.deleteShader(vs)
  gl.deleteShader(fs)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[background] program failed to link:', gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
    return null
  }
  return program
}

export function startBackground(
  canvas: HTMLCanvasElement,
  initial: {
    effect: BackgroundId
    palette: Palette
    reducedMotion: boolean
    /** Frame cap. Lower for thumbnails, where nobody is looking closely. */
    fps?: number
  },
): BackgroundHandle | null {
  const frameMs = 1000 / (initial.fps ?? DEFAULT_FPS)

  // This canvas is being started again, so whatever asked for its context to be
  // dropped has been overtaken. See `pendingRelease`.
  const release = pendingRelease.get(canvas)
  if (release !== undefined) {
    clearTimeout(release)
    pendingRelease.delete(canvas)
  }

  const context =
    (canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      // The background is redrawn every frame; keeping the last one costs
      // memory bandwidth on tiled mobile GPUs for no benefit.
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    }) as WebGLRenderingContext | null) ??
    (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null)

  if (!context) return null
  // A context can come back already lost — the tab was backgrounded long enough
  // for the GPU process to reclaim it, or the browser hit its context limit.
  // Compiling against it would fail with a null info log rather than a message,
  // so say what actually happened and let the caller fall back to the wash.
  if (context.isContextLost()) {
    console.warn('[background] the canvas has a lost WebGL context')
    return null
  }
  // Bound to its own const so the null check survives into the closures below:
  // narrowing does not reach across a hoisted function declaration.
  const gl: WebGLRenderingContext = context

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  // One oversized triangle covering clip space. No matrices, no attributes but
  // position, and half the vertices of a quad for exactly the same fragments.
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  )
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  let program: WebGLProgram | null = null
  let uniforms: Uniforms | null = null
  let effect: BackgroundId = initial.effect
  let palette = initial.palette
  let reducedMotion = initial.reducedMotion

  let frame = 0
  let running = false
  let lost = false
  /** Seconds of animation actually shown. Never advances while paused. */
  let clock = 0
  let lastAt = 0
  let lastDraw = 0
  let width = 0
  let height = 0

  function useEffect(id: BackgroundId): boolean {
    if (program) {
      gl.deleteProgram(program)
      program = null
      uniforms = null
    }
    const source = fragmentShaderFor(id)
    if (!source) return false

    program = link(gl, source)
    if (!program) return false

    gl.useProgram(program)
    uniforms = {
      resolution: gl.getUniformLocation(program, 'uResolution'),
      time: gl.getUniformLocation(program, 'uTime'),
      ground: gl.getUniformLocation(program, 'uGround'),
      accent: gl.getUniformLocation(program, 'uAccent'),
      accentBright: gl.getUniformLocation(program, 'uAccentBright'),
      craft: gl.getUniformLocation(program, 'uCraft'),
      strength: gl.getUniformLocation(program, 'uStrength'),
    }
    return true
  }

  function resize(): boolean {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
    if (w === width && h === height) return false
    width = w
    height = h
    canvas.width = w
    canvas.height = h
    gl.viewport(0, 0, w, h)
    return true
  }

  function draw() {
    if (!program || !uniforms || lost) return
    gl.useProgram(program)
    gl.uniform2f(uniforms.resolution, width, height)
    gl.uniform1f(uniforms.time, clock)
    gl.uniform3f(uniforms.ground, palette.ground[0], palette.ground[1], palette.ground[2])
    gl.uniform3f(uniforms.accent, palette.accent[0], palette.accent[1], palette.accent[2])
    gl.uniform3f(
      uniforms.accentBright,
      palette.accentBright[0],
      palette.accentBright[1],
      palette.accentBright[2],
    )
    gl.uniform3f(uniforms.craft, palette.craft[0], palette.craft[1], palette.craft[2])
    gl.uniform1f(uniforms.strength, palette.strength)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  /** One frame, right now, whatever the loop is doing. Used on every change. */
  function drawOnce() {
    resize()
    draw()
  }

  function tick(at: number) {
    if (!running) return
    frame = requestAnimationFrame(tick)

    // A tab that was hidden hands back a huge delta; clamp it or the effect
    // fast-forwards through everything it missed the moment you come back.
    const delta = lastAt === 0 ? 0 : Math.min(at - lastAt, 100)
    lastAt = at
    clock += delta / 1000

    if (at - lastDraw < frameMs) return
    lastDraw = at

    resize()
    draw()
  }

  function start() {
    if (running || reducedMotion || !program || lost) return
    running = true
    lastAt = 0
    frame = requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    if (frame) cancelAnimationFrame(frame)
    frame = 0
  }

  const onVisibility = () => {
    if (document.hidden) stop()
    else start()
  }

  const onContextLost = (e: Event) => {
    e.preventDefault()
    lost = true
    stop()
  }

  const onResize = () => {
    // Redraw immediately rather than waiting for the next frame: a paused or
    // reduced-motion background would otherwise stay stretched until something
    // else woke it up.
    if (resize()) draw()
  }

  canvas.addEventListener('webglcontextlost', onContextLost)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('resize', onResize)

  const ok = useEffect(effect)
  if (!ok) {
    canvas.removeEventListener('webglcontextlost', onContextLost)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('resize', onResize)
    gl.deleteBuffer(buffer)
    return null
  }

  drawOnce()
  start()

  return {
    setEffect(id) {
      if (id === effect) return
      effect = id
      stop()
      if (useEffect(id)) {
        drawOnce()
        start()
      }
    },
    setPalette(next) {
      palette = next
      // Repaint now. Switching theme while paused must still change colour.
      drawOnce()
    },
    setReducedMotion(reduced) {
      if (reduced === reducedMotion) return
      reducedMotion = reduced
      if (reduced) {
        stop()
        drawOnce()
      } else {
        start()
      }
    },
    pause: stop,
    resume: start,
    destroy() {
      stop()
      canvas.removeEventListener('webglcontextlost', onContextLost)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      if (program) gl.deleteProgram(program)
      gl.deleteBuffer(buffer)
      pendingRelease.set(
        canvas,
        setTimeout(() => {
          pendingRelease.delete(canvas)
          gl.getExtension('WEBGL_lose_context')?.loseContext()
        }, 0),
      )
    },
  }
}
