import { describe, it, expect } from 'vitest'
import {
  MIN_DUNGEON_MS,
  MAX_DUNGEON_MS,
  GRACE_MS,
  FLEE_RATE,
  EXPIRY_RATE,
  XP_PER_MINUTE,
  createRun,
  elapsedMs,
  runState,
  clearRun,
  fleeRun,
  expireRun,
  hasActiveRun,
} from './dungeon'
import type { DungeonRun } from './types'

const T0 = Date.UTC(2026, 0, 15, 9)
const MIN = 60_000
const PLANNED = 50 * MIN

function run(over: Partial<DungeonRun> = {}): DungeonRun {
  return {
    id: 'd1',
    objective: 'Ship the migration',
    track: 'WORK',
    startedAt: T0,
    plannedMs: PLANNED,
    endedAt: null,
    outcome: null,
    ...over,
  }
}

describe('createRun', () => {
  it('starts an active run at the current instant', () => {
    const r = createRun({ id: 'x', objective: 'Read', track: 'MIND', plannedMs: 25 * MIN }, T0)
    expect(r.startedAt).toBe(T0)
    expect(r.endedAt).toBeNull()
    expect(r.outcome).toBeNull()
  })

  it('requires a real objective — you cannot enter a dungeon with no reason', () => {
    expect(() => createRun({ id: 'x', objective: '   ', track: 'MIND', plannedMs: 25 * MIN }, T0)).toThrow(
      /objective/i,
    )
  })

  it('trims the objective', () => {
    const r = createRun({ id: 'x', objective: '  Read  ', track: 'MIND', plannedMs: 25 * MIN }, T0)
    expect(r.objective).toBe('Read')
  })

  it('rejects durations outside the allowed band', () => {
    const base = { id: 'x', objective: 'Read', track: 'MIND' as const }
    expect(() => createRun({ ...base, plannedMs: MIN_DUNGEON_MS - 1 }, T0)).toThrow(/duration/i)
    expect(() => createRun({ ...base, plannedMs: MAX_DUNGEON_MS + 1 }, T0)).toThrow(/duration/i)
  })
})

describe('elapsedMs — the anti-cheat surface', () => {
  it('is computed from the stored start, never from anything a client sends', () => {
    expect(elapsedMs(run(), T0 + 12 * MIN)).toBe(12 * MIN)
  })

  it('is unaffected by tampering with the run’s other fields', () => {
    const honest = elapsedMs(run(), T0 + 12 * MIN)
    const tampered = elapsedMs(
      run({ plannedMs: 1, endedAt: T0, outcome: 'CLEARED' }),
      T0 + 12 * MIN,
    )
    expect(tampered).toBe(honest)
  })

  it('never goes negative if the clock disagrees', () => {
    expect(elapsedMs(run(), T0 - 5_000)).toBe(0)
  })
})

describe('runState', () => {
  it('is ACTIVE before the planned duration is served', () => {
    expect(runState(run(), T0 + 10 * MIN)).toBe('ACTIVE')
  })

  it('becomes CLEARABLE the moment the time is served', () => {
    expect(runState(run(), T0 + PLANNED)).toBe('CLEARABLE')
  })

  it('stays CLEARABLE through the grace window', () => {
    expect(runState(run(), T0 + PLANNED + GRACE_MS - 1)).toBe('CLEARABLE')
  })

  it('lapses to EXPIRED once grace runs out', () => {
    expect(runState(run(), T0 + PLANNED + GRACE_MS)).toBe('EXPIRED')
  })

  it('is CLOSED once an outcome is recorded', () => {
    expect(runState(run({ endedAt: T0 + PLANNED, outcome: 'CLEARED' }), T0 + 10 * 60 * MIN)).toBe(
      'CLOSED',
    )
  })
})

describe('clearRun', () => {
  it('refuses to clear a run that has not served its time', () => {
    expect(() => clearRun(run(), T0 + PLANNED - 1)).toThrow(/not served/i)
  })

  it('pays full rate for the planned duration', () => {
    const { reward } = clearRun(run(), T0 + PLANNED)
    expect(reward.xp).toBe(Math.round(50 * XP_PER_MINUTE))
  })

  it('does not pay for overtime — the contract was the planned duration', () => {
    const short = clearRun(run(), T0 + PLANNED).reward.xp
    const long = clearRun(run(), T0 + PLANNED + 30 * MIN).reward.xp
    expect(long).toBe(short)
  })

  it('awards excelia to the track’s stats', () => {
    const { reward } = clearRun(run({ track: 'BODY' }), T0 + PLANNED)
    expect(reward.stats.STR).toBeGreaterThan(0)
    expect(reward.stats.VIT).toBeGreaterThan(0)
    expect(reward.stats.INT).toBeUndefined()
  })

  it('grants a loot roll', () => {
    expect(clearRun(run(), T0 + PLANNED).lootRolls).toBeGreaterThanOrEqual(1)
  })

  it('records the outcome', () => {
    const { run: closed } = clearRun(run(), T0 + PLANNED)
    expect(closed.outcome).toBe('CLEARED')
    expect(closed.endedAt).toBe(T0 + PLANNED)
  })

  it('refuses to clear an expired run', () => {
    expect(() => clearRun(run(), T0 + PLANNED + GRACE_MS)).toThrow(/expired/i)
  })

  it('refuses to clear a run twice', () => {
    const { run: closed } = clearRun(run(), T0 + PLANNED)
    expect(() => clearRun(closed, T0 + PLANNED)).toThrow(/closed/i)
  })

  it('applies the debuff multiplier', () => {
    const plain = clearRun(run(), T0 + PLANNED).reward.xp
    const hit = clearRun(run(), T0 + PLANNED, 0.8).reward.xp
    expect(hit).toBe(Math.round(plain * 0.8))
  })
})

describe('fleeRun', () => {
  it('pays only a fraction of the time actually served', () => {
    const { reward } = fleeRun(run(), T0 + 20 * MIN)
    expect(reward.xp).toBe(Math.round(20 * XP_PER_MINUTE * FLEE_RATE))
  })

  it('grants no loot', () => {
    expect(fleeRun(run(), T0 + 20 * MIN).lootRolls).toBe(0)
  })

  it('is always worse than seeing it through', () => {
    const fled = fleeRun(run(), T0 + PLANNED - 1).reward.xp
    const cleared = clearRun(run(), T0 + PLANNED).reward.xp
    expect(fled).toBeLessThan(cleared)
  })

  it('records the outcome', () => {
    const { run: closed } = fleeRun(run(), T0 + 20 * MIN)
    expect(closed.outcome).toBe('FLED')
  })

  it('refuses to flee a closed run', () => {
    const { run: closed } = fleeRun(run(), T0 + 20 * MIN)
    expect(() => fleeRun(closed, T0 + 25 * MIN)).toThrow(/closed/i)
  })
})

describe('expireRun', () => {
  it('pays a haircut on the planned duration — presence could not be verified', () => {
    const { reward } = expireRun(run(), T0 + PLANNED + GRACE_MS)
    expect(reward.xp).toBe(Math.round(50 * XP_PER_MINUTE * EXPIRY_RATE))
    expect(reward.gold).toBe(0)
  })

  it('refuses to expire a run still inside its grace window', () => {
    expect(() => expireRun(run(), T0 + PLANNED)).toThrow(/not expired/i)
  })

  it('grants no loot', () => {
    expect(expireRun(run(), T0 + PLANNED + GRACE_MS).lootRolls).toBe(0)
  })
})

describe('hasActiveRun', () => {
  it('is true while one is open', () => {
    expect(hasActiveRun([run()], T0 + MIN)).toBe(true)
  })

  it('is false once it is closed or expired', () => {
    expect(hasActiveRun([run({ endedAt: T0, outcome: 'FLED' })], T0 + MIN)).toBe(false)
    expect(hasActiveRun([run()], T0 + PLANNED + GRACE_MS)).toBe(false)
  })

  it('is true during the grace window — it is still yours to close', () => {
    expect(hasActiveRun([run()], T0 + PLANNED + 1)).toBe(true)
  })
})
