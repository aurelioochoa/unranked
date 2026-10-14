import { describe, expect, it } from 'vitest'
import { luminance, paletteFrom, parseColor } from './palette'

/**
 * The colour parser is the one part of the background layer that can be wrong
 * quietly. Every effect is handed four colours read out of `themes.css`; a
 * spelling this cannot read becomes black, and black-on-black is
 * indistinguishable from "the hunter chose Still" — in exactly one theme, which
 * is the hardest kind of bug to notice.
 */
describe('parseColor', () => {
  it('reads the six-digit hex the themes are mostly written in', () => {
    expect(parseColor('#38bdf8')).toEqual([56 / 255, 189 / 255, 248 / 255])
  })

  it('reads shorthand hex', () => {
    expect(parseColor('#fff')).toEqual([1, 1, 1])
    expect(parseColor('#000')).toEqual([0, 0, 0])
  })

  it('drops the alpha channel from eight-digit hex', () => {
    expect(parseColor('#38bdf880')).toEqual(parseColor('#38bdf8'))
  })

  it('reads the rgba() spellings the panel and border tokens use', () => {
    // themes.css writes these by hand, e.g. rgba(56, 189, 248, 0.28).
    expect(parseColor('rgba(56, 189, 248, 0.28)')).toEqual(parseColor('#38bdf8'))
    expect(parseColor('rgb(56,189,248)')).toEqual(parseColor('#38bdf8'))
  })

  it('reads the space-separated form a browser may hand back', () => {
    expect(parseColor('rgb(56 189 248 / 40%)')).toEqual(parseColor('#38bdf8'))
  })

  it('is not confused by leading or trailing whitespace, or by case', () => {
    // getPropertyValue returns the declaration verbatim, spaces included.
    expect(parseColor('  #38BDF8 ')).toEqual(parseColor('#38bdf8'))
  })

  it('returns null rather than guessing at anything else', () => {
    for (const input of ['', 'transparent', 'none', 'red', '#12', 'oklch(0.7 0.1 200)']) {
      expect(parseColor(input), input).toBeNull()
    }
  })
})

describe('paletteFrom', () => {
  const DARK = {
    '--color-ground': '#04070d',
    '--color-accent': '#38bdf8',
    '--color-accent-bright': '#7dd3fc',
    '--color-craft': '#f0c97a',
  }

  it('maps the four tokens onto the four uniforms', () => {
    const palette = paletteFrom(DARK)
    expect(palette.accent).toEqual(parseColor('#38bdf8'))
    expect(palette.craft).toEqual(parseColor('#f0c97a'))
  })

  it('keeps a background on a dark ground well below the interface', () => {
    // At full amplitude the wallpaper reads as bright as the panels on it.
    const strength = paletteFrom(DARK).strength
    expect(strength).toBeGreaterThan(0)
    expect(strength).toBeLessThanOrEqual(0.6)
  })

  it('cuts the amplitude much harder on a light ground', () => {
    // parchment. The same effect that glows on near-black stains a white page.
    const light = paletteFrom({ ...DARK, '--color-ground': '#f2ece0' })
    expect(light.strength).toBeLessThan(paletteFrom(DARK).strength / 2)
    expect(light.strength).toBeGreaterThan(0)
  })

  it('falls back to black for a token it cannot read, and does not throw', () => {
    const palette = paletteFrom({ '--color-ground': 'oklch(0.2 0 0)' })
    expect(palette.ground).toEqual([0, 0, 0])
    expect(palette.accent).toEqual([0, 0, 0])
  })
})

describe('luminance', () => {
  it('separates every shipped ground into dark and light', () => {
    const dark = ['#04070d', '#0a0710', '#0c0406', '#0b0b0c', '#020705', '#14100c']
    for (const hex of dark) {
      expect(luminance(parseColor(hex)!), hex).toBeLessThan(0.5)
    }
    expect(luminance(parseColor('#f2ece0')!)).toBeGreaterThan(0.5)
  })
})
