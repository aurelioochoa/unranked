import { describe, it, expect } from 'vitest'
import {
  MAX_LEVEL,
  xpToNext,
  totalXpForLevel,
  levelForTotalXp,
  progressInLevel,
  pointsForReaching,
  pointsGrantedThrough,
  applyXp,
  allocatePoints,
  addStats,
  statTotal,
  pointsFromExcelia,
  exceliaProgress,
  effectiveStats,
  EXCELIA_PER_POINT,
} from './stats'
import { ZERO_STATS } from './types'

describe('xpToNext', () => {
  it('starts small and grows monotonically', () => {
    expect(xpToNext(1)).toBe(100)
    for (let l = 1; l < 100; l++) {
      expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l))
    }
  })

  it('rejects levels outside the curve', () => {
    expect(() => xpToNext(0)).toThrow(/level/i)
    expect(() => xpToNext(MAX_LEVEL)).toThrow(/level/i)
  })
})

describe('totalXpForLevel / levelForTotalXp', () => {
  it('level 1 costs nothing', () => {
    expect(totalXpForLevel(1)).toBe(0)
    expect(levelForTotalXp(0)).toBe(1)
  })

  it('round-trips exactly at every threshold', () => {
    for (let l = 1; l <= 200; l++) {
      const at = totalXpForLevel(l)
      expect(levelForTotalXp(at)).toBe(l)
      if (l > 1) expect(levelForTotalXp(at - 1)).toBe(l - 1)
    }
  })

  it('is the running sum of xpToNext', () => {
    let sum = 0
    for (let l = 1; l < 50; l++) {
      expect(totalXpForLevel(l)).toBe(sum)
      sum += xpToNext(l)
    }
  })

  it('clamps at the ceiling rather than exploding', () => {
    expect(levelForTotalXp(Number.MAX_SAFE_INTEGER)).toBe(MAX_LEVEL)
  })

  it('treats negative total xp as level 1', () => {
    expect(levelForTotalXp(-500)).toBe(1)
  })
})

describe('progressInLevel', () => {
  it('reports position within the current level', () => {
    const p = progressInLevel(50)
    expect(p.level).toBe(1)
    expect(p.into).toBe(50)
    expect(p.need).toBe(100)
    expect(p.fraction).toBeCloseTo(0.5)
  })

  it('is exactly zero at a threshold', () => {
    const p = progressInLevel(totalXpForLevel(7))
    expect(p.level).toBe(7)
    expect(p.into).toBe(0)
    expect(p.fraction).toBe(0)
  })

  it('pins to full at the ceiling', () => {
    const p = progressInLevel(totalXpForLevel(MAX_LEVEL))
    expect(p.level).toBe(MAX_LEVEL)
    expect(p.fraction).toBe(1)
  })
})

describe('points', () => {
  it('grants three per level, with a bonus every tenth', () => {
    expect(pointsForReaching(2)).toBe(3)
    expect(pointsForReaching(9)).toBe(3)
    expect(pointsForReaching(10)).toBe(5)
    expect(pointsForReaching(20)).toBe(5)
  })

  it('grants nothing for level 1 — awakening is not an achievement', () => {
    expect(pointsForReaching(1)).toBe(0)
  })

  it('accumulates', () => {
    expect(pointsGrantedThrough(1)).toBe(0)
    expect(pointsGrantedThrough(2)).toBe(3)
    expect(pointsGrantedThrough(10)).toBe(3 * 8 + 5)
  })
})

describe('applyXp', () => {
  it('adds xp without levelling when below the threshold', () => {
    const r = applyXp(0, 50)
    expect(r.totalXp).toBe(50)
    expect(r.levelBefore).toBe(1)
    expect(r.levelAfter).toBe(1)
    expect(r.pointsGranted).toBe(0)
    expect(r.leveledUp).toBe(false)
  })

  it('levels up and grants points', () => {
    const r = applyXp(0, 100)
    expect(r.levelAfter).toBe(2)
    expect(r.pointsGranted).toBe(3)
    expect(r.leveledUp).toBe(true)
  })

  it('handles several levels in one grant', () => {
    const target = totalXpForLevel(5)
    const r = applyXp(0, target)
    expect(r.levelAfter).toBe(5)
    expect(r.pointsGranted).toBe(pointsGrantedThrough(5))
  })

  it('never loses xp to rounding across many small grants', () => {
    let total = 0
    for (let i = 0; i < 1000; i++) total = applyXp(total, 7).totalXp
    expect(total).toBe(7000)
  })

  it('refuses negative grants — xp is never taken away', () => {
    expect(() => applyXp(100, -1)).toThrow(/negative/i)
  })

  it('accepts a zero grant', () => {
    expect(applyXp(100, 0).totalXp).toBe(100)
  })
})

describe('allocatePoints', () => {
  it('spends points into stats', () => {
    const r = allocatePoints(ZERO_STATS, 5, { STR: 2, INT: 1 })
    expect(r.stats.STR).toBe(2)
    expect(r.stats.INT).toBe(1)
    expect(r.stats.VIT).toBe(0)
    expect(r.unspentPoints).toBe(2)
  })

  it('refuses to overspend', () => {
    expect(() => allocatePoints(ZERO_STATS, 2, { STR: 3 })).toThrow(/enough/i)
  })

  it('refuses negative and fractional spends', () => {
    expect(() => allocatePoints(ZERO_STATS, 5, { STR: -1 })).toThrow(/non-negative integer/i)
    expect(() => allocatePoints(ZERO_STATS, 5, { STR: 1.5 })).toThrow(/non-negative integer/i)
  })

  it('is a no-op for an empty spend', () => {
    const r = allocatePoints(ZERO_STATS, 5, {})
    expect(r.unspentPoints).toBe(5)
    expect(statTotal(r.stats)).toBe(0)
  })

  it('does not mutate the stats it was given', () => {
    const before = { ...ZERO_STATS, STR: 4 }
    allocatePoints(before, 5, { STR: 2 })
    expect(before.STR).toBe(4)
  })
})

describe('addStats', () => {
  it('merges partial stat awards', () => {
    const r = addStats({ ...ZERO_STATS, STR: 3 }, { STR: 2, CRA: 1 })
    expect(r.STR).toBe(5)
    expect(r.CRA).toBe(1)
    expect(r.PER).toBe(0)
  })

  it('ignores undefined entries', () => {
    const r = addStats(ZERO_STATS, { STR: undefined })
    expect(r.STR).toBe(0)
  })
})

describe('excelia — stats earned through deeds', () => {
  it('converts a full bar into one stat point', () => {
    expect(pointsFromExcelia(0)).toBe(0)
    expect(pointsFromExcelia(EXCELIA_PER_POINT - 1)).toBe(0)
    expect(pointsFromExcelia(EXCELIA_PER_POINT)).toBe(1)
    expect(pointsFromExcelia(EXCELIA_PER_POINT * 3 + 5)).toBe(3)
  })

  it('treats negative excelia as none', () => {
    expect(pointsFromExcelia(-50)).toBe(0)
  })

  it('reports progress toward the next point', () => {
    const p = exceliaProgress(EXCELIA_PER_POINT + 25)
    expect(p.points).toBe(1)
    expect(p.into).toBe(25)
    expect(p.need).toBe(EXCELIA_PER_POINT)
    expect(p.fraction).toBeCloseTo(0.25)
  })

  it('adds allocated points and earned points into one visible stat', () => {
    const allocated = { ...ZERO_STATS, STR: 4, INT: 2 }
    const excelia = { ...ZERO_STATS, STR: 250, CRA: 99 }
    const s = effectiveStats(allocated, excelia)
    expect(s.STR).toBe(6) // 4 allocated + 2 earned
    expect(s.INT).toBe(2) // allocated only
    expect(s.CRA).toBe(0) // 99 excelia is not yet a point
  })
})
