/**
 * Theme tokens → shader uniforms.
 *
 * This is the file that lets six effects cover seven themes. A shader never
 * names a colour; it is handed four of them, read off the live document at
 * mount and again whenever `data-theme` changes. Switch to parchment and the
 * swirl becomes ink on paper without a single line of GLSL knowing that light
 * themes exist.
 *
 * `parseColor` is exported and pure because it is the part that can actually
 * be wrong — a token spelled `rgba(...)` silently parsing to black would make
 * every background look broken in exactly one theme, which is the failure mode
 * a unit test is for.
 */

/** Linear-ish RGB in 0..1, the shape a `vec3` uniform wants. */
export type Rgb = readonly [number, number, number]

export interface Palette {
  readonly ground: Rgb
  readonly accent: Rgb
  readonly accentBright: Rgb
  readonly craft: Rgb
  /** How bright the effect is allowed to get, 0..1. Every shader scales by it. */
  readonly strength: number
}

/**
 * The ceiling on a background, on a dark theme.
 *
 * The shaders were first written to be read on their own and ran at full
 * amplitude, which put the wallpaper at roughly the brightness of the panels
 * sitting on it: the ground showed through the 86%-opaque panels, section
 * labels outside panels lost most of their contrast, and the effect stopped
 * being a background. This is the one number that keeps it subordinate to the
 * interface, and it belongs here rather than in six shaders that would drift.
 */
const DARK_CEILING = 0.5

/** Parchment is a white page: the same effect stains it rather than glowing. */
const LIGHT_CEILING = 0.14

const BLACK: Rgb = [0, 0, 0]

/** The tokens every effect is given, in uniform order. */
const TOKENS = ['--color-ground', '--color-accent', '--color-accent-bright', '--color-craft'] as const

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * Parse the colour spellings that actually appear in `themes.css`: `#rgb`,
 * `#rrggbb`, `#rrggbbaa`, `rgb(...)` and `rgba(...)`, in both the legacy
 * comma syntax and the space syntax a browser may hand back.
 *
 * Anything else returns null rather than guessing. A caller that gets null
 * keeps its previous colour, which degrades to "the background does not
 * change" instead of "the background turns black".
 */
export function parseColor(input: string): Rgb | null {
  const css = input.trim().toLowerCase()
  if (css === '' || css === 'transparent' || css === 'none') return null

  if (css.startsWith('#')) {
    const hex = css.slice(1)
    if (!/^[0-9a-f]+$/.test(hex)) return null
    // charAt over indexing: this file is compiled with noUncheckedIndexedAccess,
    // and a length check does not narrow an index expression.
    const expand = (h: string) => parseInt(h.length === 1 ? h + h : h, 16) / 255
    if (hex.length === 3 || hex.length === 4) {
      return [expand(hex.charAt(0)), expand(hex.charAt(1)), expand(hex.charAt(2))]
    }
    if (hex.length === 6 || hex.length === 8) {
      return [expand(hex.slice(0, 2)), expand(hex.slice(2, 4)), expand(hex.slice(4, 6))]
    }
    return null
  }

  const fn = /^rgba?\(([^)]*)\)$/.exec(css)
  if (fn) {
    // Both `rgb(1, 2, 3)` and `rgb(1 2 3 / 40%)` reach here; the alpha is
    // dropped either way, because a shader composites over the ground itself.
    const parts = (fn[1] ?? '')
      .replace('/', ' ')
      .split(/[,\s]+/)
      .filter((p) => p !== '')
    const [r, g, b] = parts
    if (r === undefined || g === undefined || b === undefined) return null
    const channel = (p: string) =>
      p.endsWith('%') ? clamp01(parseFloat(p) / 100) : clamp01(parseFloat(p) / 255)
    const rgb: Rgb = [channel(r), channel(g), channel(b)]
    return rgb.some((c) => Number.isNaN(c)) ? null : rgb
  }

  return null
}

/** Rec. 601 luma. Only used to decide whether a theme is a light one. */
export function luminance([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/**
 * Build the palette from a set of already-read token values.
 *
 * Split from `readPalette` so the mapping — including the light-theme
 * strength cut — is testable without a DOM.
 */
export function paletteFrom(values: Readonly<Record<string, string>>): Palette {
  const read = (token: (typeof TOKENS)[number]): Rgb => parseColor(values[token] ?? '') ?? BLACK

  const ground = read('--color-ground')
  const accent = read('--color-accent')
  const accentBright = read('--color-accent-bright')
  const craft = read('--color-craft')

  const strength = luminance(ground) > 0.5 ? LIGHT_CEILING : DARK_CEILING

  return { ground, accent, accentBright, craft, strength }
}

/** Read the live theme off an element — the document root, in practice. */
export function readPalette(el: Element): Palette {
  const computed = getComputedStyle(el)
  const values: Record<string, string> = {}
  for (const token of TOKENS) values[token] = computed.getPropertyValue(token)
  return paletteFrom(values)
}
