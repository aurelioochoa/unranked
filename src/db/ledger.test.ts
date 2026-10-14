import { describe, it, expect } from 'vitest'
import { EMPTY_FOLD, foldEvents, deriveState, compactDelta, type LedgerEntry } from './ledger'
import { pointsGrantedThrough, totalXpForLevel, EXCELIA_PER_POINT } from '@/domain/stats'
import { ZERO_STATS } from '@/domain/types'

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return { xp: 0, gold: 0, excelia: {}, allocated: {}, ...over }
}

describe('foldEvents', () => {
  it('folds an empty ledger to zero', () => {
    expect(foldEvents([])).toEqual(EMPTY_FOLD)
  })

  it('sums xp and gold', () => {
    const f = foldEvents([entry({ xp: 100, gold: 10 }), entry({ xp: 55, gold: 3 })])
    expect(f.totalXp).toBe(155)
    expect(f.gold).toBe(13)
  })

  it('sums excelia and allocations per stat', () => {
    const f = foldEvents([
      entry({ excelia: { STR: 30 } }),
      entry({ excelia: { STR: 20, INT: 5 } }),
      entry({ allocated: { VIT: 2 } }),
    ])
    expect(f.excelia.STR).toBe(50)
    expect(f.excelia.INT).toBe(5)
    expect(f.excelia.AGI).toBe(0)
    expect(f.allocated.VIT).toBe(2)
  })

  it('counts spent points as the sum of every allocation', () => {
    const f = foldEvents([entry({ allocated: { STR: 2, INT: 1 } }), entry({ allocated: { VIT: 3 } })])
    expect(f.spentPoints).toBe(6)
  })

  it('is order-independent for the totals', () => {
    const a = [entry({ xp: 10, excelia: { STR: 5 } }), entry({ xp: 3, allocated: { INT: 1 } })]
    expect(foldEvents(a)).toEqual(foldEvents([...a].reverse()))
  })

  it('supports a correcting entry rather than a deletion', () => {
    const f = foldEvents([entry({ xp: 500 }), entry({ xp: -200 })])
    expect(f.totalXp).toBe(300)
  })
})

describe('deriveState', () => {
  it('derives level 1 from an empty ledger', () => {
    const s = deriveState(EMPTY_FOLD)
    expect(s.level).toBe(1)
    expect(s.unspentPoints).toBe(0)
    expect(s.stats).toEqual(ZERO_STATS)
  })

  it('grants exactly the points the level earned, less what was spent', () => {
    const fold = foldEvents([
      entry({ xp: totalXpForLevel(5) }),
      entry({ allocated: { STR: 4 } }),
    ])
    const s = deriveState(fold)
    expect(s.level).toBe(5)
    expect(s.unspentPoints).toBe(pointsGrantedThrough(5) - 4)
    expect(s.stats.STR).toBe(4)
  })

  it('shows earned points alongside placed ones', () => {
    const fold = foldEvents([
      entry({ excelia: { STR: EXCELIA_PER_POINT * 2 + 40 } }),
      entry({ allocated: { STR: 1 } }),
    ])
    expect(deriveState(fold).stats.STR).toBe(3)
  })

  it('goes negative if the ledger was over-spent — the fold reports, it does not hide', () => {
    // allocatePoints() refuses to overspend, so this state should be unreachable.
    // If it ever appears, the fold must surface it rather than clamp it away.
    const fold = foldEvents([entry({ allocated: { STR: 5 } })])
    expect(deriveState(fold).unspentPoints).toBe(-5)
  })
})

describe('compactDelta', () => {
  it('drops zeroes and undefined', () => {
    expect(compactDelta({ STR: 3, VIT: 0 })).toEqual({ STR: 3 })
  })

  it('keeps negative corrections', () => {
    expect(compactDelta({ STR: -3 })).toEqual({ STR: -3 })
  })
})
