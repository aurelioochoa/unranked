'use client'

import { useEffect, useRef, useState } from 'react'
import { readPalette } from './palette'
import { backgroundOr, type BackgroundId } from './registry'
import { startBackground, type BackgroundHandle } from './runner'

/**
 * The canvas behind everything.
 *
 * Mounted once in the root layout, below `.shell` and below the scanlines. It
 * is `aria-hidden` and `pointer-events: none` — it is wallpaper, and nothing in
 * it is ever content.
 *
 * It is driven by two attributes on the document element rather than by props:
 * `data-theme` for the colours and `data-background` for the effect. Both are
 * set by the pickers the instant you click, and persisted behind you. Waiting
 * for the server round trip to come back through a prop would make both
 * controls read as broken, which is the same seam `useThemeChoice` was written
 * to close — a background is a thing you flick through, not a thing you submit.
 *
 * The prop is the server's value, used only to seed the first render so the
 * markup matches what comes back from the database.
 *
 * If WebGL is unavailable the canvas is dropped from the tree entirely and the
 * themes' own ground wash is what remains — which is the 'Still' background,
 * and a complete design in its own right.
 */
export function Background({ initial }: { initial: BackgroundId }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const handle = useRef<BackgroundHandle | null>(null)
  const [effect, setEffect] = useState<BackgroundId>(initial)
  const [failed, setFailed] = useState(false)

  // Follow the server when it disagrees — a reset, or another tab.
  useEffect(() => setEffect(initial), [initial])

  useEffect(() => {
    const root = document.documentElement
    const read = () => setEffect(backgroundOr(root.getAttribute('data-background')))
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-background'] })
    return () => observer.disconnect()
  }, [])

  /*
   * The GL context is torn down only when the background is switched off
   * entirely. Swapping between two effects recompiles one shader and keeps
   * everything else; a theme change is four uniform writes. Neither is a
   * remount.
   */
  const enabled = effect !== 'none' && !failed

  useEffect(() => {
    handle.current?.setEffect(effect)
  }, [effect])

  useEffect(() => {
    if (!enabled) return
    const el = canvas.current
    if (!el) return

    const root = document.documentElement
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const started = startBackground(el, {
      effect,
      palette: readPalette(root),
      reducedMotion: motion.matches,
    })

    if (!started) {
      setFailed(true)
      return
    }
    handle.current = started

    const themes = new MutationObserver(() => started.setPalette(readPalette(root)))
    themes.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    const onMotion = () => started.setReducedMotion(motion.matches)
    motion.addEventListener('change', onMotion)

    return () => {
      themes.disconnect()
      motion.removeEventListener('change', onMotion)
      started.destroy()
      handle.current = null
    }
    // `effect` seeds the first shader here and is swapped in by the effect
    // above from then on; listing it would throw away the context on every
    // change to draw the same quad.
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return null

  return <canvas ref={canvas} className="background-canvas" aria-hidden="true" />
}
