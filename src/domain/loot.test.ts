import { describe, it, expect } from 'vitest'
import { LOOT_TABLE, RARITY_WEIGHTS, rollLoot, lootById } from './loot'
import { RANKS } from './types'

describe('LOOT_TABLE', () => {
  it('has unique ids', () => {
    expect(new Set(LOOT_TABLE.map((i) => i.id)).size).toBe(LOOT_TABLE.length)
  })

  it('covers every rarity', () => {
    for (const r of Object.keys(RARITY_WEIGHTS)) {
      expect(LOOT_TABLE.some((i) => i.rarity === r)).toBe(true)
    }
  })

  it('gives every item a non-empty name and description', () => {
    for (const i of LOOT_TABLE) {
      expect(i.name.trim().length).toBeGreaterThan(0)
      expect(i.description.trim().length).toBeGreaterThan(0)
    }
  })

  it('never mixes a magnitude into an effect that has none', () => {
    for (const i of LOOT_TABLE) {
      if (i.effect === 'PENALTY_WAIVER' || i.effect === 'DECAY_RESET') {
        expect(i.magnitude).toBe(0)
      } else {
        expect(i.magnitude).toBeGreaterThan(0)
      }
    }
  })
})

describe('rollLoot', () => {
  it('is deterministic for a seed', () => {
    expect(rollLoot('run:d1', 3)).toEqual(rollLoot('run:d1', 3))
  })

  it('differs across seeds', () => {
    const a = rollLoot('run:d1', 5).map((i) => i.id).join()
    const b = rollLoot('run:d2', 5).map((i) => i.id).join()
    expect(a).not.toBe(b)
  })

  it('returns exactly the number of rolls asked for', () => {
    expect(rollLoot('x', 0)).toHaveLength(0)
    expect(rollLoot('x', 1)).toHaveLength(1)
    expect(rollLoot('x', 4)).toHaveLength(4)
  })

  it('treats a negative roll count as none', () => {
    expect(rollLoot('x', -3)).toHaveLength(0)
  })

  it('respects rarity weighting — commons dominate, legendaries are rare', () => {
    const counts: Record<string, number> = {}
    for (let i = 0; i < 20_000; i++) {
      const item = rollLoot(`seed-${i}`, 1)[0]!
      counts[item.rarity] = (counts[item.rarity] ?? 0) + 1
    }
    expect(counts.COMMON!).toBeGreaterThan(counts.UNCOMMON!)
    expect(counts.UNCOMMON!).toBeGreaterThan(counts.RARE!)
    expect(counts.RARE!).toBeGreaterThan(counts.EPIC!)
    expect(counts.EPIC!).toBeGreaterThan(counts.LEGENDARY!)
    expect(counts.LEGENDARY! / 20_000).toBeLessThan(0.03)
  })

  it('only ever returns items from the table', () => {
    for (const item of rollLoot('sweep', 50)) {
      expect(lootById(item.id)).toBe(item)
    }
  })
})

describe('lootById', () => {
  it('finds a known item and returns undefined otherwise', () => {
    expect(lootById(LOOT_TABLE[0]!.id)).toBe(LOOT_TABLE[0])
    expect(lootById('no-such-item')).toBeUndefined()
  })

  it('is not fooled by a rank name', () => {
    for (const r of RANKS) expect(lootById(r)).toBeUndefined()
  })
})
