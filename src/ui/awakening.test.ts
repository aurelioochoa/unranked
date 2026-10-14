import { describe, expect, it } from 'vitest'
import {
  AWAKENING_STEPS,
  MAX_NAME,
  QUEST_ROLES,
  coreWarning,
  flagsToRole,
  normalizeName,
  roleToFlags,
} from './awakening'

describe('normalizeName', () => {
  it('takes a name as given', () => {
    expect(normalizeName('Sung Jinwoo')).toBe('Sung Jinwoo')
  })

  it('trims, because a trailing space is not a different name', () => {
    expect(normalizeName('  Aurelio  ')).toBe('Aurelio')
  })

  it('collapses the newlines a pasted name arrives with', () => {
    // Otherwise it renders as a broken heading on every screen, forever.
    expect(normalizeName('Sung\n\tJinwoo')).toBe('Sung Jinwoo')
  })

  it('refuses a name that is only whitespace', () => {
    expect(normalizeName('   ')).toBeNull()
    expect(normalizeName('')).toBeNull()
    expect(normalizeName('\n\t')).toBeNull()
  })

  it('caps the length the column expects', () => {
    const name = normalizeName('x'.repeat(200))
    expect(name).not.toBeNull()
    expect(name!.length).toBe(MAX_NAME)
  })
})

describe('coreWarning', () => {
  it('says nothing about a sane daily set', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(coreWarning(n), String(n)).toBeNull()
  })

  it('warns that too many dailies will be worth a fraction of face value', () => {
    // The decay rule is invisible until it has already happened, so the step
    // that lets you choose six says it before you leave, not in week two.
    expect(coreWarning(6)).toContain('6')
    expect(coreWarning(9)).not.toBeNull()
  })

  it('warns about none at all, which empties the Penalty Zone too', () => {
    expect(coreWarning(0)).not.toBeNull()
  })
})

describe('quest roles', () => {
  it('round-trips every role through the two booleans stored', () => {
    for (const role of QUEST_ROLES) {
      expect(flagsToRole(roleToFlags(role)), role).toBe(role)
    }
  })

  it('keeps a disabled quest off whatever its core flag says', () => {
    // A template that was core and then switched off must read as Off, not
    // Daily — the row keeps is_core, and only `enabled` decides visibility.
    expect(flagsToRole({ isCore: true, enabled: false })).toBe('OFF')
  })
})

describe('the ritual itself', () => {
  it('asks for a designation first and takes the oath last', () => {
    expect(AWAKENING_STEPS.at(0)?.id).toBe('designation')
    expect(AWAKENING_STEPS.at(-1)?.id).toBe('oath')
  })

  it('gives every step a line for the System to say', () => {
    for (const step of AWAKENING_STEPS) {
      expect(step.line.length, step.id).toBeGreaterThan(0)
      expect(step.title.length, step.id).toBeGreaterThan(0)
    }
  })

  it('numbers its steps uniquely', () => {
    const ids = AWAKENING_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
