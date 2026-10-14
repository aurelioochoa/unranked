import { describe, it, expect } from 'vitest'
import {
  DECAY_FLOOR,
  DECAY_RATE,
  NOVELTY_BONUS,
  REDISCOVERY_BONUS,
  REDISCOVERY_DAYS,
  repetitionMultiplier,
  computeQuestReward,
  fullClearBonus,
  selectDailyTemplates,
  repetitionContextFrom,
} from './quests'
import type { QuestTemplate, Tier } from './types'

function template(over: Partial<QuestTemplate> = {}): QuestTemplate {
  return {
    id: 't1',
    title: 'Push-ups ×100',
    description: '',
    track: 'BODY',
    tier: 2 as Tier,
    statRewards: { STR: 20, VIT: 10 },
    baseXp: 100,
    baseGold: 10,
    isCore: true,
    enabled: true,
    ...over,
  }
}

describe('repetitionMultiplier — the anti-plateau rule', () => {
  it('pays a bonus the first time a quest is ever done', () => {
    expect(repetitionMultiplier({ priorStreak: 0, daysSinceLast: null })).toBe(NOVELTY_BONUS)
  })

  it('pays full value when a streak has not started', () => {
    expect(repetitionMultiplier({ priorStreak: 0, daysSinceLast: 1 })).toBe(1)
  })

  it('pays strictly less for every extra consecutive day', () => {
    let previous = repetitionMultiplier({ priorStreak: 0, daysSinceLast: 1 })
    for (let streak = 1; streak <= 60; streak++) {
      const now = repetitionMultiplier({ priorStreak: streak, daysSinceLast: 1 })
      expect(now).toBeLessThan(previous)
      previous = now
    }
  })

  it('never pays nothing — maintenance still counts for something', () => {
    for (let streak = 0; streak <= 1000; streak++) {
      expect(repetitionMultiplier({ priorStreak: streak, daysSinceLast: 1 })).toBeGreaterThanOrEqual(
        DECAY_FLOOR,
      )
    }
    expect(repetitionMultiplier({ priorStreak: 10_000, daysSinceLast: 1 })).toBeCloseTo(DECAY_FLOOR, 5)
  })

  it('follows the documented curve', () => {
    expect(repetitionMultiplier({ priorStreak: 1, daysSinceLast: 1 })).toBeCloseTo(
      DECAY_FLOOR + (1 - DECAY_FLOOR) * DECAY_RATE,
    )
  })

  it('refreshes after a long enough absence', () => {
    expect(repetitionMultiplier({ priorStreak: 0, daysSinceLast: REDISCOVERY_DAYS })).toBe(
      REDISCOVERY_BONUS,
    )
    expect(repetitionMultiplier({ priorStreak: 40, daysSinceLast: REDISCOVERY_DAYS + 5 })).toBe(
      REDISCOVERY_BONUS,
    )
  })

  it('does not refresh one day short of the threshold', () => {
    expect(repetitionMultiplier({ priorStreak: 0, daysSinceLast: REDISCOVERY_DAYS - 1 })).toBe(1)
  })

  it('rejects a negative streak', () => {
    expect(() => repetitionMultiplier({ priorStreak: -1, daysSinceLast: 1 })).toThrow(/streak/i)
  })
})

describe('computeQuestReward', () => {
  it('pays the base rate on a fresh non-novel completion', () => {
    const r = computeQuestReward(template(), { priorStreak: 0, daysSinceLast: 1 })
    expect(r.xp).toBe(100)
    expect(r.gold).toBe(10)
    expect(r.stats.STR).toBe(20)
    expect(r.stats.VIT).toBe(10)
  })

  it('scales everything by the repetition multiplier', () => {
    const r = computeQuestReward(template(), { priorStreak: 0, daysSinceLast: null })
    expect(r.xp).toBe(125)
    expect(r.stats.STR).toBe(25)
  })

  it('applies an active penalty debuff on top of decay', () => {
    const plain = computeQuestReward(template(), { priorStreak: 3, daysSinceLast: 1 })
    const debuffed = computeQuestReward(template(), { priorStreak: 3, daysSinceLast: 1 }, 0.9)
    expect(debuffed.xp).toBeLessThan(plain.xp)
    expect(debuffed.xp).toBe(Math.max(1, Math.round(plain.xp * 0.9)))
  })

  it('never rounds a real reward down to zero', () => {
    const tiny = template({ baseXp: 1, baseGold: 1, statRewards: { STR: 1 } })
    const r = computeQuestReward(tiny, { priorStreak: 500, daysSinceLast: 1 }, 0.5)
    expect(r.xp).toBeGreaterThanOrEqual(1)
    expect(r.stats.STR).toBeGreaterThanOrEqual(1)
  })

  it('leaves untouched stats absent rather than zero', () => {
    const r = computeQuestReward(template(), { priorStreak: 0, daysSinceLast: 1 })
    expect(r.stats.INT).toBeUndefined()
  })

  it('rejects a debuff outside (0, 1]', () => {
    expect(() => computeQuestReward(template(), { priorStreak: 0, daysSinceLast: 1 }, 0)).toThrow()
    expect(() => computeQuestReward(template(), { priorStreak: 0, daysSinceLast: 1 }, 1.5)).toThrow()
  })
})

describe('fullClearBonus', () => {
  it('is a quarter of the day’s xp', () => {
    expect(fullClearBonus([{ xp: 100, gold: 0, stats: {} }, { xp: 60, gold: 0, stats: {} }]).xp).toBe(40)
  })

  it('is nothing for an empty day', () => {
    expect(fullClearBonus([]).xp).toBe(0)
  })
})

describe('selectDailyTemplates', () => {
  const core = [
    template({ id: 'c1', isCore: true }),
    template({ id: 'c2', isCore: true }),
  ]
  const rotating = Array.from({ length: 8 }, (_, i) =>
    template({ id: `r${i}`, isCore: false }),
  )
  const all = [...core, ...rotating]

  it('always issues every enabled core quest', () => {
    const out = selectDailyTemplates({
      templates: all,
      dayKey: '2026-01-15',
      daysSinceLast: new Map(),
      rotatingCount: 2,
    })
    expect(out.map((t) => t.id)).toEqual(expect.arrayContaining(['c1', 'c2']))
  })

  it('issues exactly the requested number of rotating quests', () => {
    const out = selectDailyTemplates({
      templates: all,
      dayKey: '2026-01-15',
      daysSinceLast: new Map(),
      rotatingCount: 3,
    })
    expect(out.filter((t) => !t.isCore)).toHaveLength(3)
  })

  it('never issues the same template twice', () => {
    const out = selectDailyTemplates({
      templates: all,
      dayKey: '2026-01-15',
      daysSinceLast: new Map(),
      rotatingCount: 5,
    })
    expect(new Set(out.map((t) => t.id)).size).toBe(out.length)
  })

  it('is stable across repeated calls for the same day', () => {
    const args = {
      templates: all,
      dayKey: '2026-01-15',
      daysSinceLast: new Map(),
      rotatingCount: 3,
    }
    expect(selectDailyTemplates(args).map((t) => t.id)).toEqual(
      selectDailyTemplates(args).map((t) => t.id),
    )
  })

  it('gives a different draw on a different day', () => {
    const base = { templates: all, daysSinceLast: new Map(), rotatingCount: 3 }
    const a = selectDailyTemplates({ ...base, dayKey: '2026-01-15' }).map((t) => t.id)
    const b = selectDailyTemplates({ ...base, dayKey: '2026-02-20' }).map((t) => t.id)
    expect(a).not.toEqual(b)
  })

  it('skips disabled templates entirely', () => {
    const out = selectDailyTemplates({
      templates: [...all, template({ id: 'off', isCore: true, enabled: false })],
      dayKey: '2026-01-15',
      daysSinceLast: new Map(),
      rotatingCount: 2,
    })
    expect(out.map((t) => t.id)).not.toContain('off')
  })

  it('strongly favours quests you have neglected', () => {
    const stale = new Map<string, number>()
    for (const t of rotating) stale.set(t.id, 0) // all done today...
    stale.delete('r7') // ...except this one, never done
    let chosen = 0
    for (let day = 0; day < 40; day++) {
      const out = selectDailyTemplates({
        templates: all,
        dayKey: `2026-03-${String(day + 1).padStart(2, '0')}`,
        daysSinceLast: stale,
        rotatingCount: 1,
      })
      if (out.some((t) => t.id === 'r7')) chosen++
    }
    expect(chosen).toBeGreaterThan(30)
  })

  it('copes with asking for more rotating quests than exist', () => {
    const out = selectDailyTemplates({
      templates: [...core, rotating[0]!],
      dayKey: '2026-01-15',
      daysSinceLast: new Map(),
      rotatingCount: 99,
    })
    expect(out.filter((t) => !t.isCore)).toHaveLength(1)
  })
})

describe('repetitionContextFrom', () => {
  const today = '2026-01-15'

  it('reports a never-completed quest as novel', () => {
    expect(repetitionContextFrom([], today)).toEqual({ priorStreak: 0, daysSinceLast: null })
  })

  it('counts an unbroken run ending yesterday', () => {
    const keys = ['2026-01-12', '2026-01-13', '2026-01-14']
    expect(repetitionContextFrom(keys, today)).toEqual({ priorStreak: 3, daysSinceLast: 1 })
  })

  it('breaks the streak on a missed day', () => {
    const keys = ['2026-01-11', '2026-01-12', '2026-01-14']
    expect(repetitionContextFrom(keys, today)).toEqual({ priorStreak: 1, daysSinceLast: 1 })
  })

  it('reports no streak when the last completion was not yesterday', () => {
    expect(repetitionContextFrom(['2026-01-10'], today)).toEqual({
      priorStreak: 0,
      daysSinceLast: 5,
    })
  })

  it('ignores today and anything later — this is history, not intent', () => {
    expect(repetitionContextFrom(['2026-01-15', '2026-01-20'], today)).toEqual({
      priorStreak: 0,
      daysSinceLast: null,
    })
  })

  it('tolerates duplicates and unsorted input', () => {
    const keys = ['2026-01-14', '2026-01-12', '2026-01-14', '2026-01-13']
    expect(repetitionContextFrom(keys, today)).toEqual({ priorStreak: 3, daysSinceLast: 1 })
  })

  it('crosses a month boundary', () => {
    expect(repetitionContextFrom(['2026-01-30', '2026-01-31'], '2026-02-01')).toEqual({
      priorStreak: 2,
      daysSinceLast: 1,
    })
  })

  it('rejects a malformed day key', () => {
    expect(() => repetitionContextFrom(['15/01/2026'], today)).toThrow(/day key/i)
  })
})
