/**
 * The background registry.
 *
 * Deliberately free of WebGL, GLSL and `window`: the Settings page and the
 * Awakening both render this list on the server, and importing a shader module
 * to get a label would drag the whole renderer into the server bundle.
 *
 * A background is *not* a theme. The theme decides the colours; the background
 * decides the motion. Six effects across seven themes is forty-two looks, and
 * that only holds because no effect names a colour — every one of them reads
 * the active palette at runtime. See `palette.ts`.
 */

export const BACKGROUNDS = [
  'none',
  'swirl',
  'rift',
  'starfield',
  'scanner',
  'grid',
  'glyphs',
] as const
export type BackgroundId = (typeof BACKGROUNDS)[number]

/** The still one. Every theme's own ground wash, and nothing else. */
export const DEFAULT_BACKGROUND: BackgroundId = 'none'

export interface BackgroundMeta {
  readonly name: string
  /** One line, in the System's register. The preview does the rest. */
  readonly note: string
}

export const BACKGROUND_LABELS: Readonly<Record<BackgroundId, BackgroundMeta>> = Object.freeze({
  none: { name: 'Still', note: 'No motion. The ground wash alone.' },
  swirl: { name: 'Swirl', note: 'Paint turning in water. Slow, wide, hypnotic.' },
  rift: { name: 'Rift', note: 'A Gate, torn open and holding.' },
  starfield: { name: 'Starfield', note: 'Depth. Drifting, parallaxed, quiet.' },
  scanner: { name: 'Scanner', note: 'Rings and a sweeping beam. The System, looking.' },
  grid: { name: 'Grid', note: 'A floor receding, rippling outward from centre.' },
  glyphs: { name: 'Glyphs', note: 'Falling characters. Rain in a terminal.' },
})

export function isBackground(value: string): value is BackgroundId {
  return (BACKGROUNDS as readonly string[]).includes(value)
}

export function backgroundOr(value: string | null | undefined): BackgroundId {
  return value != null && isBackground(value) ? value : DEFAULT_BACKGROUND
}
