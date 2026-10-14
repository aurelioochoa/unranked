import { describe, it, expect } from 'vitest'
import {
  PENALTY_WINDOW_MS,
  MAX_SEVERITY,
  BASE_SEVERITY,
  ESCALATION_STEP,
  STACK_STEP,
  evaluateDeadlines,
  evaluatePenaltyLapses,
  activeDebuffMultiplier,
  resolvePenalty,
  isScar,
} from './penalty'
import type { Penalty, Quest } from './types'

const T0 = Date.UTC(2026, 0, 15, 4)

function quest(over: Partial<Quest> = {}): Quest {
  return {
    id: 'q1',
    templateId: 't1',
    issuedAt: T0,
    dueAt: T0 + 86_400_000,
    status: 'ISSUED',
    completedAt: null,
    ...over,
  }
}

function penalty(over: Partial<Penalty> = {}): Penalty {
  return {
    id: 'p1',
    sourceQuestId: 'q1',
    issuedAt: T0,
    dueAt: T0 + PENALTY_WINDOW_MS,
    requirement: 'Clear it, harder.',
    status: 'ACTIVE',
    resolvedAt: null,
    escalation: 0,
    ...over,
  }
}

describe('evaluateDeadlines', () => {
  it('does nothing before the deadline', () => {
    const r = evaluateDeadlines([quest()], T0 + 1_000, [])
    expect(r.failedQuestIds).toEqual([])
    expect(r.penalty).toBeNull()
  })

  it('fails a quest the instant its deadline arrives', () => {
    const q = quest()
    const r = evaluateDeadlines([q], q.dueAt, [])
    expect(r.failedQuestIds).toEqual(['q1'])
    expect(r.penalty).not.toBeNull()
  })

  it('issues ONE penalty however many quests were abandoned', () => {
    // A bad day must not become five separate atonements. That treadmill is
    // the single most cited reason people quit this genre.
    const qs = [quest({ id: 'a' }), quest({ id: 'b' }), quest({ id: 'c' }), quest({ id: 'd' })]
    const r = evaluateDeadlines(qs, T0 + 90_000_000, [])
    expect(r.failedQuestIds).toEqual(['a', 'b', 'c', 'd'])
    expect(r.penalty).not.toBeNull()
  })

  it('issues no new penalty while one is already outstanding', () => {
    // You are in the Penalty Zone or you are not. Ignoring it escalates the
    // one you have; it never spawns a second.
    const r = evaluateDeadlines([quest()], T0 + 90_000_000, [penalty()])
    expect(r.failedQuestIds).toEqual(['q1'])
    expect(r.penalty).toBeNull()
  })

  it('still fails the quests even when no penalty is issued', () => {
    const qs = [quest({ id: 'a' }), quest({ id: 'b' })]
    const r = evaluateDeadlines(qs, T0 + 90_000_000, [penalty()])
    expect(r.failedQuestIds).toEqual(['a', 'b'])
  })

  it('ignores a resolved penalty when deciding whether one is outstanding', () => {
    const r = evaluateDeadlines([quest()], T0 + 90_000_000, [penalty({ status: 'RESOLVED' })])
    expect(r.penalty).not.toBeNull()
  })

  it('windows the penalty from the earliest missed deadline, not from discovery', () => {
    // The app may only notice days later; the window must not restart then.
    const early = quest({ id: 'a', dueAt: T0 + 1_000 })
    const late = quest({ id: 'b', dueAt: T0 + 90_000_000 })
    const r = evaluateDeadlines([late, early], T0 + 200_000_000, [])
    expect(r.penalty!.issuedAt).toBe(early.dueAt)
    expect(r.penalty!.dueAt).toBe(early.dueAt + PENALTY_WINDOW_MS)
  })

  it('ignores quests already completed', () => {
    const q = quest({ status: 'COMPLETE', completedAt: T0 + 100 })
    expect(evaluateDeadlines([q], q.dueAt + 1, []).failedQuestIds).toEqual([])
  })

  it('ignores quests already failed — a failure is punished once', () => {
    const q = quest({ status: 'FAILED' })
    expect(evaluateDeadlines([q], q.dueAt + 1, []).failedQuestIds).toEqual([])
  })

  it('starts a new penalty unescalated', () => {
    const r = evaluateDeadlines([quest()], T0 + 90_000_000, [])
    expect(r.penalty!.escalation).toBe(0)
  })

  it('names what was abandoned in the requirement', () => {
    const qs = [quest({ id: 'a' }), quest({ id: 'b' })]
    const r = evaluateDeadlines(qs, T0 + 90_000_000, [], (missed) =>
      `Redo ${missed.length}: ${missed.map((q) => q.templateId).join(', ')}.`,
    )
    expect(r.penalty!.requirement).toBe('Redo 2: t1, t1.')
  })
})

describe('evaluatePenaltyLapses', () => {
  it('leaves a penalty alone inside its window', () => {
    const r = evaluatePenaltyLapses([penalty()], T0 + 1_000)
    expect(r.expiredIds).toEqual([])
    expect(r.replacements).toEqual([])
  })

  it('expires a lapsed penalty and replaces it with a heavier one', () => {
    const p = penalty()
    const r = evaluatePenaltyLapses([p], p.dueAt)
    expect(r.expiredIds).toEqual(['p1'])
    expect(r.replacements).toHaveLength(1)
    expect(r.replacements[0]!.escalation).toBe(1)
    expect(r.replacements[0]!.sourceQuestId).toBe('q1')
  })

  it('keeps escalating rather than ever giving up on you', () => {
    let current = penalty({ escalation: 4 })
    const r = evaluatePenaltyLapses([current], current.dueAt + 1)
    expect(r.replacements[0]!.escalation).toBe(5)
  })

  it('ignores penalties already resolved or expired', () => {
    const done = penalty({ id: 'p2', status: 'RESOLVED', resolvedAt: T0 })
    const gone = penalty({ id: 'p3', status: 'EXPIRED' })
    const r = evaluatePenaltyLapses([done, gone], T0 + 10 * PENALTY_WINDOW_MS)
    expect(r.expiredIds).toEqual([])
  })
})

describe('activeDebuffMultiplier', () => {
  it('is exactly 1 with nothing active', () => {
    expect(activeDebuffMultiplier([], 'NORMAL')).toBe(1)
    expect(activeDebuffMultiplier([penalty({ status: 'RESOLVED' })], 'NORMAL')).toBe(1)
  })

  it('applies the difficulty’s base severity for one penalty', () => {
    expect(activeDebuffMultiplier([penalty()], 'NORMAL')).toBeCloseTo(1 - BASE_SEVERITY.NORMAL)
    expect(activeDebuffMultiplier([penalty()], 'MONARCH')).toBeCloseTo(1 - BASE_SEVERITY.MONARCH)
  })

  it('bites harder for each escalation', () => {
    const once = activeDebuffMultiplier([penalty({ escalation: 0 })], 'NORMAL')
    const twice = activeDebuffMultiplier([penalty({ escalation: 1 })], 'NORMAL')
    expect(twice).toBeCloseTo(once - ESCALATION_STEP)
  })

  it('stacks across several active penalties, but sub-linearly', () => {
    const one = activeDebuffMultiplier([penalty({ id: 'a' })], 'NORMAL')
    const two = activeDebuffMultiplier([penalty({ id: 'a' }), penalty({ id: 'b' })], 'NORMAL')
    expect(two).toBeCloseTo(one - STACK_STEP)
  })

  it('never takes more than the cap — the hole always has a bottom', () => {
    const many = Array.from({ length: 50 }, (_, i) => penalty({ id: `p${i}`, escalation: 20 }))
    const m = activeDebuffMultiplier(many, 'MONARCH')
    expect(m).toBeCloseTo(1 - MAX_SEVERITY)
    expect(m).toBeGreaterThan(0)
  })
})

describe('resolvePenalty', () => {
  it('marks it resolved at the given instant', () => {
    const r = resolvePenalty(penalty(), T0 + 5_000)
    expect(r.status).toBe('RESOLVED')
    expect(r.resolvedAt).toBe(T0 + 5_000)
  })

  it('refuses to resolve one that is not active', () => {
    expect(() => resolvePenalty(penalty({ status: 'RESOLVED' }), T0)).toThrow(/active/i)
  })

  it('clears the debuff once resolved', () => {
    const r = resolvePenalty(penalty(), T0 + 5_000)
    expect(activeDebuffMultiplier([r], 'NORMAL')).toBe(1)
  })
})

describe('isScar', () => {
  it('counts a failed quest', () => {
    expect(isScar(quest({ status: 'FAILED' }))).toBe(true)
    expect(isScar(quest({ status: 'COMPLETE' }))).toBe(false)
    expect(isScar(quest({ status: 'ISSUED' }))).toBe(false)
  })
})
