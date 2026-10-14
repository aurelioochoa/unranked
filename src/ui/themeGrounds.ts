/**
 * The theme registry.
 *
 * Ground colours are duplicated from themes.css out of necessity: the browser
 * needs a theme colour for the address bar and the PWA splash before any
 * stylesheet is parsed, and there is no way to hand it a CSS custom property.
 * This is the one place a raw colour may live outside the stylesheet — a `.ts`
 * token module, never a component.
 *
 * Keep each ground in step with the `--color-ground` of its theme in
 * `themes.css`. Adding a theme means one block there and one entry here.
 */

export const THEMES = [
  'hologram',
  'monarch',
  'sovereign',
  'terminal',
  'phosphor',
  'falna',
  'parchment',
] as const
export type ThemeId = (typeof THEMES)[number]

export const THEME_GROUNDS: Readonly<Record<ThemeId, string>> = Object.freeze({
  hologram: '#04070d',
  monarch: '#0a0710',
  sovereign: '#0c0406',
  terminal: '#0b0b0c',
  phosphor: '#020705',
  falna: '#14100c',
  parchment: '#f2ece0',
})

/** Shown by every theme picker. One line each — the swatch does the rest. */
export const THEME_LABELS: Readonly<Record<ThemeId, { name: string; note: string }>> =
  Object.freeze({
    hologram: { name: 'Hologram', note: 'Cyan glass. The faithful one.' },
    monarch: { name: 'Monarch', note: 'Violet and gold. Quiet.' },
    sovereign: { name: 'Sovereign', note: 'Crimson on obsidian. Loud.' },
    terminal: { name: 'Terminal', note: 'Mono. Software, not magic.' },
    phosphor: { name: 'Phosphor', note: 'Green CRT. Heavy scanlines.' },
    falna: { name: 'Falna', note: 'A divine record.' },
    parchment: { name: 'Parchment', note: 'Ink on paper. The light one.' },
  })

export const DEFAULT_THEME: ThemeId = 'hologram'

export function isTheme(value: string): value is ThemeId {
  return (THEMES as readonly string[]).includes(value)
}

export function groundFor(theme: string): string {
  return isTheme(theme) ? THEME_GROUNDS[theme] : THEME_GROUNDS[DEFAULT_THEME]
}
