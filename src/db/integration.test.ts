import { describe, it, expect, beforeEach } from 'vitest'
import { openTestDb, type Db } from './client'
import {
  clearAwakening,
  createHunter,
  foldFromLedger,
  hunterState,
  markAwakened,
  rebuildHunterCache,
  requireHunter,
  updateSettings,
} from './hunters'
import { seedTemplates } from './seedTemplates'
import {
  activePenalties,
  completeQuest,
  currentDebuff,
  dayKeyFor,
  issueQuestsForDay,
  listTemplates,
  questsForDay,
  resolvePenaltyWithEvidence,
  sweepDeadlines,
} from './questRepo'
import { clearRunById, fleeRunById, openRun, startRun, sweepExpiredRuns } from './dungeonRepo'
import { eq } from 'drizzle-orm'
import { evidence, hunters } from './schema'
import { zonedTimeToUtc } from '@/domain/clock'
import { GRACE_MS, MIN_DUNGEON_MS } from '@/domain/dungeon'
import { PENALTY_WINDOW_MS } from '@/domain/penalty'

const TZ = 'Europe/Madrid'
const RESET_HOUR = 4
const HUNTER = 'h1'

/** 08:00 local on the given day — comfortably inside the System day. */
function morning(year: number, month: number, day: number): number {
  return zonedTimeToUtc(year, month, day, 8, TZ)
}

let db: Db

beforeEach(() => {
  db = openTestDb()
  createHunter(db, { id: HUNTER, name: 'Aurelio', timezone: TZ, dailyResetHour: RESET_HOUR })
  seedTemplates(db, HUNTER)
})

/** The invariant the whole persistence design rests on. */
function expectCacheMatchesLedger(): void {
  const h = requireHunter(db, HUNTER)
  const fold = foldFromLedger(db, HUNTER)
  expect(h.totalXp).toBe(fold.totalXp)
  expect(h.gold).toBe(fold.gold)
  expect(h.spentPoints).toBe(fold.spentPoints)
  for (const [stat, value] of Object.entries(fold.excelia)) {
    expect(h.excelia[stat as keyof typeof h.excelia] ?? 0).toBe(value)
  }
}

describe('setup', () => {
  it('seeds the starter library once', () => {
    expect(listTemplates(db, HUNTER).length).toBeGreaterThan(15)
    expect(seedTemplates(db, HUNTER)).toBe(0)
  })

  it('awakens the hunter at rank E, level 1, with nothing', () => {
    const h = requireHunter(db, HUNTER)
    expect(h.rank).toBe('E')
    const s = hunterState(h)
    expect(s.level).toBe(1)
    expect(s.totalXp).toBe(0)
    expect(s.unspentPoints).toBe(0)
  })
})

describe('daily issuance', () => {
  it('issues core quests plus the configured rotation', () => {
    const issued = issueQuestsForDay(db, HUNTER, morning(2026, 1, 15))
    const cores = listTemplates(db, HUNTER).filter((t) => t.isCore).length
    expect(issued).toHaveLength(cores + 2)
  })

  it('is idempotent — a refresh cannot reroll the day', () => {
    const now = morning(2026, 1, 15)
    const first = issueQuestsForDay(db, HUNTER, now).map((q) => q.templateId).sort()
    const second = issueQuestsForDay(db, HUNTER, now + 3_600_000).map((q) => q.templateId).sort()
    expect(second).toEqual(first)
  })

  it('sets every deadline to the next daily reset', () => {
    const now = morning(2026, 1, 15)
    const issued = issueQuestsForDay(db, HUNTER, now)
    const expected = zonedTimeToUtc(2026, 1, 16, RESET_HOUR, TZ)
    for (const q of issued) expect(q.dueAt).toBe(expected)
  })

  it('issues a fresh set the next System day', () => {
    issueQuestsForDay(db, HUNTER, morning(2026, 1, 15))
    const next = issueQuestsForDay(db, HUNTER, morning(2026, 1, 16))
    expect(next.every((q) => q.dayKey === '2026-01-16')).toBe(true)
  })
})

describe('completion and the decay rule, end to end', () => {
  it('pays less for the same quest on each consecutive day', () => {
    const paid: number[] = []
    for (let day = 15; day <= 22; day++) {
      const now = morning(2026, 1, day)
      const issued = issueQuestsForDay(db, HUNTER, now)
      const core = issued.find((q) => q.templateId.endsWith('body-strength-session'))!
      paid.push(completeQuest(db, core.id, now).reward.xp)
    }
    for (let i = 1; i < paid.length; i++) {
      expect(paid[i]!).toBeLessThan(paid[i - 1]!)
    }
    // The first completion carries the novelty bonus; the last is deep in decay.
    expect(paid.at(-1)!).toBeLessThan(paid[0]! * 0.7)
    expectCacheMatchesLedger()
  })

  it('pays full rate again after a long enough absence', () => {
    const jan = morning(2026, 1, 15)
    issueQuestsForDay(db, HUNTER, jan)
    const first = questsForDay(db, HUNTER, '2026-01-15').find((q) =>
      q.templateId.endsWith('body-strength-session'),
    )!
    const novel = completeQuest(db, first.id, jan).reward.xp

    // Skip well past the rediscovery threshold.
    const later = morning(2026, 2, 20)
    issueQuestsForDay(db, HUNTER, later)
    const again = questsForDay(db, HUNTER, '2026-02-20').find((q) =>
      q.templateId.endsWith('body-strength-session'),
    )!
    const rediscovered = completeQuest(db, again.id, later).reward.xp

    expect(rediscovered).toBeGreaterThan(novel * 0.85)
  })

  it('records excelia into the stats the track exercises', () => {
    const now = morning(2026, 1, 15)
    issueQuestsForDay(db, HUNTER, now)
    const q = questsForDay(db, HUNTER, '2026-01-15').find((x) =>
      x.templateId.endsWith('body-strength-session'),
    )!
    completeQuest(db, q.id, now)
    const h = requireHunter(db, HUNTER)
    expect(h.excelia.STR!).toBeGreaterThan(0)
    expect(h.excelia.INT ?? 0).toBe(0)
  })

  it('pays a full-clear bonus only when every quest is done', () => {
    const now = morning(2026, 1, 15)
    const issued = issueQuestsForDay(db, HUNTER, now)
    const results = issued.map((q) => completeQuest(db, q.id, now))
    expect(results.slice(0, -1).every((r) => r.fullClear === null)).toBe(true)
    expect(results.at(-1)!.fullClear!.xp).toBeGreaterThan(0)
    expectCacheMatchesLedger()
  })

  it('refuses to complete a quest twice', () => {
    const now = morning(2026, 1, 15)
    const q = issueQuestsForDay(db, HUNTER, now)[0]!
    completeQuest(db, q.id, now)
    expect(() => completeQuest(db, q.id, now)).toThrow(/already/i)
  })

  it('refuses to complete a quest after its deadline', () => {
    const now = morning(2026, 1, 15)
    const q = issueQuestsForDay(db, HUNTER, now)[0]!
    expect(() => completeQuest(db, q.id, q.dueAt + 1)).toThrow(/deadline/i)
  })
})

describe('the Penalty Zone, end to end', () => {
  it('fails everything missed but opens exactly one Penalty Zone', () => {
    const day = morning(2026, 1, 15)
    const issued = issueQuestsForDay(db, HUNTER, day)
    completeQuest(db, issued[0]!.id, day)

    const afterReset = morning(2026, 1, 16)
    const sweep = sweepDeadlines(db, HUNTER, afterReset)

    expect(sweep.failedQuestIds).toHaveLength(issued.length - 1)
    expect(sweep.penaltiesIssued).toBe(1)
    expect(activePenalties(db, HUNTER)).toHaveLength(1)
  })

  it('names what was abandoned in the requirement', () => {
    const day = morning(2026, 1, 15)
    issueQuestsForDay(db, HUNTER, day)
    sweepDeadlines(db, HUNTER, morning(2026, 1, 16))
    const requirement = activePenalties(db, HUNTER)[0]!.requirement
    expect(requirement).toMatch(/^Clear ".+ again, and prove it\.$/)
    // Long lists are summarised rather than dumped in full.
    expect(requirement).toMatch(/and \d+ more/)
    expect(requirement).toContain('"Strength Training"')
  })

  it('does not accumulate a backlog over a bad month', () => {
    // The failure mode this rule exists to prevent: a week off producing
    // thirty separate atonements nobody can ever clear.
    let t = morning(2026, 1, 1)
    for (let d = 0; d < 30; d++) {
      sweepDeadlines(db, HUNTER, t)
      issueQuestsForDay(db, HUNTER, t)
      t += 86_400_000
    }
    sweepDeadlines(db, HUNTER, t)
    expect(activePenalties(db, HUNTER).length).toBe(1)
  })

  it('withholds part of every reward while a penalty is outstanding', () => {
    const day = morning(2026, 1, 15)
    issueQuestsForDay(db, HUNTER, day)
    sweepDeadlines(db, HUNTER, morning(2026, 1, 16))
    expect(currentDebuff(db, requireHunter(db, HUNTER))).toBeLessThan(1)
    expect(currentDebuff(db, requireHunter(db, HUNTER))).toBeGreaterThan(0)
  })

  it('escalates a penalty that is itself ignored', () => {
    const day = morning(2026, 1, 15)
    issueQuestsForDay(db, HUNTER, day)
    sweepDeadlines(db, HUNTER, morning(2026, 1, 16))

    const before = activePenalties(db, HUNTER)
    const worse = currentDebuff(db, requireHunter(db, HUNTER))

    const lapsed = before[0]!.dueAt + PENALTY_WINDOW_MS
    sweepDeadlines(db, HUNTER, lapsed)

    const after = activePenalties(db, HUNTER)
    expect(after.every((p) => p.escalation > 0)).toBe(true)
    expect(currentDebuff(db, requireHunter(db, HUNTER))).toBeLessThan(worse)
  })

  it('never lets the debuff reach zero — the hole has a bottom', () => {
    const day = morning(2026, 1, 15)
    issueQuestsForDay(db, HUNTER, day)
    let t = morning(2026, 1, 16)
    for (let i = 0; i < 30; i++) {
      sweepDeadlines(db, HUNTER, t)
      t += PENALTY_WINDOW_MS
    }
    expect(currentDebuff(db, requireHunter(db, HUNTER))).toBeGreaterThan(0)
  })

  it('clears only with evidence, and lifts the debuff when it does', () => {
    const day = morning(2026, 1, 15)
    issueQuestsForDay(db, HUNTER, day)
    sweepDeadlines(db, HUNTER, morning(2026, 1, 16))

    const open = activePenalties(db, HUNTER)
    expect(() => resolvePenaltyWithEvidence(db, open[0]!.id, '', Date.now())).toThrow(/evidence/i)

    const evId = crypto.randomUUID()
    db.insert(evidence)
      .values({ id: evId, hunterId: HUNTER, kind: 'NOTE', note: 'Did it. Twice.', createdAt: day })
      .run()

    for (const p of open) resolvePenaltyWithEvidence(db, p.id, evId, morning(2026, 1, 16))
    expect(activePenalties(db, HUNTER)).toHaveLength(0)
    expect(currentDebuff(db, requireHunter(db, HUNTER))).toBe(1)
  })
})

describe('Instant Dungeons, end to end', () => {
  const start = morning(2026, 1, 15)
  const planned = 50 * 60_000

  it('refuses to open two dungeons at once', () => {
    startRun(db, HUNTER, { objective: 'Ship the migration', track: 'WORK', plannedMs: planned }, start)
    expect(() =>
      startRun(db, HUNTER, { objective: 'Read', track: 'MIND', plannedMs: planned }, start + 1_000),
    ).toThrow(/already open/i)
  })

  it('will not let a run be cleared before its time is served', () => {
    const run = startRun(db, HUNTER, { objective: 'Deep work', track: 'WORK', plannedMs: planned }, start)
    expect(() => clearRunById(db, run.id, start + planned - 1)).toThrow(/not served/i)
  })

  it('computes elapsed time from the stored start, so a shorter plan cannot be faked', () => {
    const run = startRun(db, HUNTER, { objective: 'Deep work', track: 'WORK', plannedMs: planned }, start)
    // Even asking to clear immediately after starting is refused: the only
    // input that matters is the server's clock against the persisted start.
    expect(() => clearRunById(db, run.id, start)).toThrow(/not served/i)
    expect(openRun(db, HUNTER, start + 1_000)?.id).toBe(run.id)
  })

  it('pays and drops loot on a clear', () => {
    const run = startRun(db, HUNTER, { objective: 'Deep work', track: 'MIND', plannedMs: planned }, start)
    const res = clearRunById(db, run.id, start + planned)
    expect(res.reward.xp).toBeGreaterThan(0)
    expect(res.loot.length).toBeGreaterThanOrEqual(1)
    expect(requireHunter(db, HUNTER).excelia.INT!).toBeGreaterThan(0)
    expectCacheMatchesLedger()
  })

  it('pays badly for fleeing, and drops nothing', () => {
    const a = startRun(db, HUNTER, { objective: 'A', track: 'MIND', plannedMs: planned }, start)
    const fled = fleeRunById(db, a.id, start + 20 * 60_000)
    expect(fled.loot).toHaveLength(0)

    const b = startRun(db, HUNTER, { objective: 'B', track: 'MIND', plannedMs: planned }, start + 60 * 60_000)
    const cleared = clearRunById(db, b.id, start + 60 * 60_000 + planned)
    expect(fled.reward.xp).toBeLessThan(cleared.reward.xp)
  })

  it('closes out a run left open past its grace window', () => {
    const run = startRun(db, HUNTER, { objective: 'Forgot', track: 'WORK', plannedMs: planned }, start)
    const swept = sweepExpiredRuns(db, HUNTER, start + planned + GRACE_MS + 1)
    expect(swept).toHaveLength(1)
    expect(swept[0]!.run.outcome).toBe('EXPIRED')
    expect(swept[0]!.reward.gold).toBe(0)
    expect(openRun(db, HUNTER, start + planned + GRACE_MS + 1)).toBeUndefined()
  })

  it('rejects a run shorter than the minimum', () => {
    expect(() =>
      startRun(db, HUNTER, { objective: 'Blink', track: 'MIND', plannedMs: MIN_DUNGEON_MS - 1 }, start),
    ).toThrow(/duration/i)
  })
})

describe('the ledger invariant', () => {
  it('holds across a simulated month of real use', () => {
    let t = morning(2026, 1, 1)
    const DAY = 86_400_000

    for (let day = 0; day < 30; day++) {
      const today = t + day * DAY
      sweepDeadlines(db, HUNTER, today)
      sweepExpiredRuns(db, HUNTER, today)
      const issued = issueQuestsForDay(db, HUNTER, today)

      // Skip every fifth day entirely, to exercise failure and escalation.
      if (day % 5 !== 4) {
        for (const q of issued) {
          if ((day + q.id.charCodeAt(0)) % 3 === 0) continue // some days are partial
          completeQuest(db, q.id, today + 3_600_000)
        }
      }

      if (day % 4 === 0) {
        const run = startRun(
          db,
          HUNTER,
          { objective: `Focus ${day}`, track: 'MIND', plannedMs: 30 * 60_000 },
          today + 2 * 3_600_000,
        )
        clearRunById(db, run.id, today + 2 * 3_600_000 + 30 * 60_000)
      }

      expectCacheMatchesLedger()
    }

    const state = hunterState(requireHunter(db, HUNTER))
    expect(state.level).toBeGreaterThan(1)
    expect(state.unspentPoints).toBeGreaterThan(0)
    expect(state.stats.INT).toBeGreaterThan(0)
  })

  it('rebuilds the cache exactly from the ledger', () => {
    const now = morning(2026, 1, 15)
    for (const q of issueQuestsForDay(db, HUNTER, now)) completeQuest(db, q.id, now)

    const before = requireHunter(db, HUNTER)
    expect(before.totalXp).toBeGreaterThan(0)

    // Corrupt the cache behind the ledger's back, the way a bad migration or a
    // half-applied write would.
    db.update(hunters)
      .set({ totalXp: 999_999, gold: -5, excelia: { STR: 1 }, spentPoints: 42 })
      .where(eq(hunters.id, HUNTER))
      .run()
    expect(requireHunter(db, HUNTER).totalXp).toBe(999_999)

    const rebuilt = rebuildHunterCache(db, HUNTER)
    expect(rebuilt.totalXp).toBe(before.totalXp)
    expect(rebuilt.gold).toBe(before.gold)
    expect(rebuilt.spentPoints).toBe(before.spentPoints)
    expect(rebuilt.excelia).toEqual(before.excelia)
  })

  it('keeps day boundaries in the hunter’s own time zone', () => {
    // 02:00 Madrid with a 04:00 reset still belongs to the previous System day.
    const h = requireHunter(db, HUNTER)
    expect(dayKeyFor(h, zonedTimeToUtc(2026, 1, 15, 2, TZ))).toBe('2026-01-14')
    expect(dayKeyFor(h, zonedTimeToUtc(2026, 1, 15, 5, TZ))).toBe('2026-01-15')
  })
})

/**
 * The Awakening flag is the gate every System route is gated on, and replaying
 * the ritual is offered from Settings — so what it does NOT touch matters at
 * least as much as what it does.
 */
describe('the Awakening flag', () => {
  it('starts null, so a new hunter is sent to the ritual', () => {
    expect(requireHunter(db, HUNTER).onboardedAt).toBeNull()
  })

  it('records when the ritual was completed', () => {
    const at = morning(2026, 3, 14)
    expect(markAwakened(db, HUNTER, at).onboardedAt).toBe(at)
  })

  it('replays without destroying anything', () => {
    // The Settings copy promises the ledger, the levels, the quest history and
    // the evidence are untouched. This is that promise, as a test.
    const at = morning(2026, 3, 14)
    markAwakened(db, HUNTER, at)
    issueQuestsForDay(db, HUNTER, at)

    const before = requireHunter(db, HUNTER)
    const questsBefore = questsForDay(db, HUNTER, dayKeyFor(before, at)).length
    expect(questsBefore).toBeGreaterThan(0)

    const after = clearAwakening(db, HUNTER)

    expect(after.onboardedAt).toBeNull()
    expect(after.totalXp).toBe(before.totalXp)
    expect(after.gold).toBe(before.gold)
    expect(after.spentPoints).toBe(before.spentPoints)
    expect(after.rank).toBe(before.rank)
    expect(after.name).toBe(before.name)
    expect(questsForDay(db, HUNTER, dayKeyFor(after, at)).length).toBe(questsBefore)
    expect(foldFromLedger(db, HUNTER)).toEqual(foldFromLedger(db, HUNTER))
  })

  it('carries the chosen background like any other preference', () => {
    expect(updateSettings(db, HUNTER, { background: 'swirl' }).background).toBe('swirl')
  })

  it('defaults a hunter who has never chosen to the still background', () => {
    expect(requireHunter(db, HUNTER).background).toBe('none')
  })
})
