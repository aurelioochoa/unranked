import { describe, it, expect } from 'vitest'
import { makeRng, hashSeed, pickWeighted, shuffled } from './random'

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42)
    const b = makeRng(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('differs between seeds', () => {
    const a = makeRng(1)
    const b = makeRng(2)
    const same = Array.from({ length: 50 }, () => a() === b()).filter(Boolean).length
    expect(same).toBe(0)
  })

  it('stays inside [0, 1)', () => {
    const r = makeRng(7)
    for (let i = 0; i < 10_000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('is roughly uniform', () => {
    const r = makeRng(99)
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 100_000; i++) buckets[Math.floor(r() * 10)]!++
    for (const b of buckets) expect(b).toBeGreaterThan(8_000)
  })
})

describe('hashSeed', () => {
  it('is stable for the same string', () => {
    expect(hashSeed('2026-01-15')).toBe(hashSeed('2026-01-15'))
  })

  it('separates similar strings', () => {
    expect(hashSeed('2026-01-15')).not.toBe(hashSeed('2026-01-16'))
  })

  it('returns a non-negative 32-bit integer', () => {
    for (const s of ['', 'a', 'quest:daily:2026-03-09']) {
      const h = hashSeed(s)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(2 ** 32)
    }
  })
})

describe('pickWeighted', () => {
  it('never picks a zero-weight item', () => {
    const items = [
      { v: 'a', w: 0 },
      { v: 'b', w: 1 },
    ]
    const r = makeRng(3)
    for (let i = 0; i < 200; i++) {
      expect(pickWeighted(items, (i) => i.w, r)!.v).toBe('b')
    }
  })

  it('favours heavier items', () => {
    const items = [
      { v: 'light', w: 1 },
      { v: 'heavy', w: 9 },
    ]
    const r = makeRng(5)
    let heavy = 0
    for (let i = 0; i < 10_000; i++) {
      if (pickWeighted(items, (i) => i.w, r)!.v === 'heavy') heavy++
    }
    expect(heavy).toBeGreaterThan(8_500)
    expect(heavy).toBeLessThan(9_500)
  })

  it('returns undefined for an empty or all-zero pool', () => {
    const r = makeRng(1)
    expect(pickWeighted([], () => 1, r)).toBeUndefined()
    expect(pickWeighted([{ w: 0 }], (i) => i.w, r)).toBeUndefined()
  })
})

describe('shuffled', () => {
  it('is a permutation', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = shuffled(input, makeRng(11))
    expect([...out].sort((a, b) => a - b)).toEqual(input)
  })

  it('does not mutate the input', () => {
    const input = [1, 2, 3]
    shuffled(input, makeRng(2))
    expect(input).toEqual([1, 2, 3])
  })

  it('is deterministic for a seed', () => {
    expect(shuffled([1, 2, 3, 4, 5], makeRng(8))).toEqual(shuffled([1, 2, 3, 4, 5], makeRng(8)))
  })
})
