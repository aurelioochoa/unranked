import { describe, expect, it } from 'vitest'
import { BACKGROUNDS, BACKGROUND_LABELS, backgroundOr, isBackground } from './registry'
import { FRAGMENT_SHADERS, fragmentShaderFor } from './shaders'

describe('the background registry', () => {
  it('labels every background it offers', () => {
    for (const id of BACKGROUNDS) {
      expect(BACKGROUND_LABELS[id], id).toBeDefined()
      expect(BACKGROUND_LABELS[id].name.length, id).toBeGreaterThan(0)
      expect(BACKGROUND_LABELS[id].note.length, id).toBeGreaterThan(0)
    }
  })

  it('has a shader for every background but the still one', () => {
    for (const id of BACKGROUNDS) {
      if (id === 'none') {
        expect(fragmentShaderFor(id)).toBeNull()
      } else {
        expect(fragmentShaderFor(id), id).not.toBeNull()
      }
    }
  })

  it('offers no shader the registry does not list', () => {
    for (const id of Object.keys(FRAGMENT_SHADERS)) {
      expect(isBackground(id), id).toBe(true)
    }
  })

  /*
   * The whole point of the token contract: an effect that spelled a colour
   * would be right in one theme and wrong in the other six. `make boundaries`
   * enforces this for components, which are .tsx; the shaders are .ts, so they
   * are checked here instead.
   */
  it('never names a colour in a shader', () => {
    for (const [id, source] of Object.entries(FRAGMENT_SHADERS)) {
      expect(source, id).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(source, id).not.toMatch(/\brgba?\s*\(/)
    }
  })

  it('hands every shader the same uniform contract', () => {
    for (const [id, source] of Object.entries(FRAGMENT_SHADERS)) {
      for (const uniform of ['uResolution', 'uTime', 'uGround', 'uAccent', 'uStrength']) {
        expect(source, `${id} declares ${uniform}`).toContain(`uniform`)
        expect(source, `${id} uses ${uniform}`).toContain(uniform)
      }
    }
  })

  /*
   * Every effect must fade toward the theme's own ground, or a light theme gets
   * a black rectangle behind a white page. `uStrength` is the amplitude control
   * that makes that possible, so an effect that ignores it is a bug.
   */
  it('scales every shader by uStrength', () => {
    for (const [id, source] of Object.entries(FRAGMENT_SHADERS)) {
      expect(source, id).toContain('uStrength')
      expect(source, id).toContain('uGround')
    }
  })

  describe('backgroundOr', () => {
    it('accepts what it knows', () => {
      expect(backgroundOr('swirl')).toBe('swirl')
    })

    it('falls back to the still one for anything else', () => {
      // A row written by an older version, or a hand-edited database.
      for (const input of ['balatro', '', null, undefined]) {
        expect(backgroundOr(input)).toBe('none')
      }
    })
  })
})
