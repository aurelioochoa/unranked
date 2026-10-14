/**
 * The six effects, as GLSL ES 1.00.
 *
 * WebGL 1 rather than 2 on purpose: this runs behind a habit tracker on
 * whatever phone is to hand, and WebGL 1 is the version that is simply always
 * there. Nothing here needs a feature newer than that — no derivatives, no
 * texture fetch, no float render target. Every effect is a single full-screen
 * pass over one oversized triangle.
 *
 * The shared contract, and the reason `registry.ts` can stay this small:
 *
 *   uResolution   drawing-buffer size in device pixels
 *   uTime         seconds since the effect started, frozen when paused
 *   uGround       the theme's ground colour — what the effect fades toward
 *   uAccent       its primary
 *   uAccentBright its highlight
 *   uCraft        its third colour, the gold/craft one
 *   uStrength     global amplitude; light themes hand this down hard
 *
 * No effect may write a literal colour. That is the same rule the components
 * live under, enforced there by `make boundaries` and here by there being
 * nowhere to put one — a shader that named cyan would be wrong in six themes.
 *
 * One editing hazard: the shaders are template literals, so a backtick in a
 * GLSL comment ends the string and the file stops parsing several hundred
 * lines later. Quote identifiers in these comments plainly.
 */

import type { BackgroundId } from './registry'

export const VERTEX_SHADER = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

/**
 * Prelude shared by every fragment shader.
 *
 * highp is asked for and mediump accepted: several of these accumulate a value
 * over five iterations and band visibly at mediump, but a shader that fails to
 * compile outright is worse than one that bands.
 */
const PRELUDE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uGround;
uniform vec3 uAccent;
uniform vec3 uAccentBright;
uniform vec3 uCraft;
uniform float uStrength;

const float TAU = 6.2831853;

/** Screen position, centred, aspect-corrected against the shorter side. */
vec2 centred() {
  return (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/** Value noise. Cheap, and every effect that wants turbulence builds on it. */
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * noise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
`

/*
 * Paint turning in water.
 *
 * A radial spin that tightens toward the edge, then five rounds of domain
 * warping — each one feeding the coordinate back through a sine of itself,
 * which is what turns smooth rotation into marbling. The final length of the
 * warped coordinate is read as "how much paint is here" and split three ways
 * across the palette.
 *
 * This is the effect that started the whole feature; it is the Balatro-style
 * one, rewritten against our tokens.
 */
const SWIRL = `
void main() {
  vec2 p = centred();
  float r = length(p);

  // Spin, harder the further out you are — the source of the marbled arms.
  float a = atan(p.y, p.x) + uTime * 0.085 + r * 2.4;
  p = vec2(cos(a), sin(a)) * r * 9.0;

  float t = uTime * 0.32;
  vec2 q = vec2(p.x + p.y);
  for (int i = 0; i < 5; i++) {
    q += sin(max(p.x, p.y)) + p;
    p += 0.5 * vec2(cos(1.71 + 0.353 * q.y + t * 0.131), sin(q.x - 0.113 * t));
    p -= cos(p.x + p.y) - sin(p.x * 0.711 - p.y);
  }

  float v = clamp(length(p) * 0.052, 0.0, 2.0);

  // Three overlapping bands across v. The weights are deliberately soft so the
  // colours bleed into one another instead of drawing hard contours.
  float k = 1.3;
  float w1 = max(0.0, 1.0 - k * abs(1.0 - v));
  float w2 = max(0.0, 1.0 - k * abs(v));
  float w3 = 1.0 - min(1.0, w1 + w2);

  vec3 paint = uAccent * w1 + uAccentBright * w2 + uCraft * w3;

  vec3 col = mix(uGround, paint, 0.62 * uStrength);
  col = mix(col, uGround, smoothstep(0.32, 1.15, r));   // vignette back to ground
  gl_FragColor = vec4(col, 1.0);
}
`

/*
 * A Gate, torn open and holding.
 *
 * A vertical tear whose position wanders on noise, with a hard exponential
 * core and a wide soft halo. The turbulence is sampled twice at different
 * scales and rates so the inside of the rift never settles into a loop you can
 * see. Embers rise on the third term.
 */
const RIFT = `
void main() {
  vec2 p = centred();
  float t = uTime * 0.22;

  float wander = fbm(vec2(p.y * 1.7, t)) - 0.5;
  float d = abs(p.x - wander * 0.42);

  float turb = fbm(vec2(p.x * 3.4 + t * 1.3, p.y * 2.6 - t * 2.1));
  float core = exp(-d * 17.0) * (0.55 + 0.7 * turb);
  float halo = exp(-d * 2.6) * turb;

  /*
   * Embers: sparse points drifting upward, and only near the tear.
   *
   * pow(noise, n) was the first attempt and is unbounded at the top: the
   * few cells near 1.0 came out as huge soft blobs the size of a panel, drawn
   * halfway across the screen. smoothstep clamps at 1 and the higher frequency
   * keeps them the size of an ember instead.
   */
  vec2 e = vec2(p.x * 34.0, p.y * 34.0 - uTime * 2.2);
  float ember = smoothstep(0.88, 1.0, noise(e)) * exp(-d * 6.0);

  vec3 col = uGround;
  col += uAccent * halo * 0.42 * uStrength;
  col += uAccentBright * core * 0.85 * uStrength;
  col += uCraft * ember * 0.55 * uStrength;

  col = mix(col, uGround, smoothstep(0.5, 1.3, length(p)));
  gl_FragColor = vec4(col, 1.0);
}
`

/*
 * Depth.
 *
 * Three parallax layers of hashed cells. Each cell either holds a star or does
 * not — `step` rather than a branch, because a branch here costs more than the
 * work it skips. The near layer moves fastest and twinkles hardest; the far
 * one barely moves, which is the whole trick.
 */
const STARFIELD = `
float layer(vec2 uv, float scale, float speed, float density, float seed) {
  uv = uv * scale + vec2(uTime * speed * 0.6, uTime * speed);
  vec2 id = floor(uv);
  vec2 f = fract(uv);

  float h = hash(id + seed);
  float present = step(density, h);

  vec2 at = vec2(hash(id + seed + 1.37), hash(id + seed + 7.71));
  float d = length(f - at);

  float twinkle = 0.55 + 0.45 * sin(uTime * 2.2 + h * 40.0);
  return present * smoothstep(0.075, 0.0, d) * twinkle;
}

void main() {
  vec2 p = centred();

  float far = layer(p, 26.0, 0.010, 0.80, 0.0);
  float mid = layer(p, 15.0, 0.024, 0.86, 11.0);
  float near = layer(p, 8.0, 0.052, 0.91, 23.0);

  // A slow wash of dust, so the black between stars is not flat.
  float dust = fbm(p * 1.6 + vec2(uTime * 0.012, 0.0));

  vec3 col = uGround;
  col += uAccent * dust * 0.16 * uStrength;
  col += uAccent * far * 0.5 * uStrength;
  col += uAccentBright * mid * 0.8 * uStrength;
  col += mix(uAccentBright, uCraft, 0.5) * near * 1.15 * uStrength;

  gl_FragColor = vec4(col, 1.0);
}
`

/*
 * The System, looking.
 *
 * Concentric rings expanding from centre, six faint spokes, and a beam that
 * sweeps once every ten seconds trailing a decaying wake behind it. The wake
 * is the reason the angle is unwrapped rather than taken absolute: a symmetric
 * falloff reads as a bow-tie, not a radar.
 */
const SCANNER = `
void main() {
  vec2 p = centred();
  float r = length(p);
  float a = atan(p.y, p.x);

  float rings = pow(max(0.0, 1.0 - abs(sin(r * 17.0 - uTime * 0.55))), 22.0);
  float spokes = pow(abs(cos(a * 3.0)), 90.0) * smoothstep(0.06, 0.5, r);

  // Angle behind the sweep, 0 at the beam and growing the further back you are.
  float sweep = mod(uTime * 0.62, TAU);
  float behind = mod(a - sweep + TAU, TAU);
  float beam = exp(-behind * 2.6);

  float falloff = exp(-r * 1.35);
  float grain = noise(p * 90.0 + uTime * 3.0) * 0.035;

  vec3 col = uGround;
  col += uAccent * rings * 0.30 * uStrength;
  col += uCraft * spokes * 0.10 * uStrength;
  col += uAccentBright * beam * falloff * 0.34 * uStrength;
  col += uAccent * grain * uStrength;

  gl_FragColor = vec4(col, 1.0);
}
`

/*
 * A floor receding, rippling outward from centre.
 *
 * Two planes — one below the horizon, one above — sharing a single expression
 * by taking `abs(p.y)`. Perspective is the reciprocal of height, so the line
 * width has to shrink with depth by hand: `fwidth` needs an extension in
 * WebGL 1 and this is one derivative not worth an extension check.
 */
const GRID = `
void main() {
  vec2 p = centred();
  float depth = 1.0 / (abs(p.y) + 0.10);

  vec2 g = vec2(p.x * depth * 1.4, depth * 1.15 + uTime * 0.55);

  // Ripple travelling out from the centre of the plane.
  float ripple = sin(length(g) * 0.85 - uTime * 1.5) * 0.075;
  g += ripple;

  vec2 cell = abs(fract(g) - 0.5);
  float line = min(cell.x, cell.y);

  // Lines thin with depth, then fade out entirely before they alias.
  float width = 0.020 + 0.0016 * depth;
  float grid = 1.0 - smoothstep(0.0, width, line);
  float fade = exp(-depth * 0.115) * smoothstep(0.0, 0.14, abs(p.y));

  // The horizon itself, and a glow sitting on it.
  float horizon = exp(-abs(p.y) * 46.0);

  vec3 col = uGround;
  col += uAccent * grid * fade * 0.85 * uStrength;
  col += uAccentBright * horizon * 0.30 * uStrength;
  col += uCraft * grid * fade * ripple * 1.6 * uStrength;

  col = mix(col, uGround, smoothstep(0.55, 1.25, length(p)));
  gl_FragColor = vec4(col, 1.0);
}
`

/*
 * Rain in a terminal.
 *
 * Glyphs without a font: each cell is a 5×7 dot matrix whose bits are hashed
 * from the cell id and a time step, so characters appear to change as they
 * fall. A texture atlas would give real letters and cost a network request, a
 * decode and a sampler — for something living behind the interface at low
 * opacity, dot matrix is indistinguishable and free.
 *
 * This is the only effect that works in device pixels rather than the
 * normalised frame: a glyph has to be a fixed size on screen, or it stretches.
 */
const GLYPHS = `
void main() {
  vec2 size = vec2(11.0, 15.0);
  vec2 uv = gl_FragCoord.xy / size;
  vec2 id = floor(uv);
  vec2 f = fract(uv);

  float rows = uResolution.y / size.y;
  float fromTop = rows - id.y;

  // Every column falls at its own rate, from its own starting offset.
  float speed = 0.55 + hash(vec2(id.x, 1.0)) * 1.9;
  float head = fract(hash(vec2(id.x, 3.0)) + uTime * speed * 0.075) * (rows + 26.0) - 13.0;

  float behind = head - fromTop;
  float trail = step(0.0, behind) * exp(-behind * 0.17);
  float lead = smoothstep(1.4, 0.0, abs(behind));

  // 5x7 matrix, re-rolled a few times a second so the character seems to change.
  // Not named dot: that is a built-in, and a variable would shadow it here.
  vec2 cellDot = floor(f * vec2(5.0, 7.0));
  float roll = floor(uTime * 5.0 + hash(id) * 20.0);
  float bit = step(0.55, hash(vec2(id.x * 7.3 + cellDot.x, id.y * 13.1 + cellDot.y + roll * 31.7)));

  // A gap between glyphs, so the column reads as characters and not a bar.
  float inside = step(0.08, f.x) * step(f.x, 0.92) * step(0.06, f.y) * step(f.y, 0.94);
  float ink = bit * inside;

  vec3 col = uGround;
  // The densest of the six by nature, so it is mixed the quietest: at full
  // gain the rain competes with the labels that sit directly on it.
  col += uAccent * ink * trail * 0.52 * uStrength;
  col += uAccentBright * ink * lead * 0.7 * uStrength;

  gl_FragColor = vec4(col, 1.0);
}
`

/**
 * Fragment shader per effect. `none` is absent rather than a pass-through:
 * choosing it should tear the canvas down, not run a shader that draws the
 * ground colour sixty times a second.
 */
export const FRAGMENT_SHADERS: Readonly<Partial<Record<BackgroundId, string>>> = Object.freeze({
  swirl: PRELUDE + SWIRL,
  rift: PRELUDE + RIFT,
  starfield: PRELUDE + STARFIELD,
  scanner: PRELUDE + SCANNER,
  grid: PRELUDE + GRID,
  glyphs: PRELUDE + GLYPHS,
})

export function fragmentShaderFor(id: BackgroundId): string | null {
  return FRAGMENT_SHADERS[id] ?? null
}
