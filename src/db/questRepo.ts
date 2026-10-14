/**
 * Quest issuance, completion, and the deadline sweep.
 *
 * The sweep is the System's teeth: it is what turns a missed deadline into a
 * Penalty without anyone having to be watching. It is idempotent and driven
 * entirely by the clock it is handed, so a month of it can be replayed in a
 * test in milliseconds.
 */

import { and, eq, inArray, lte } from 'drizzle-orm'
import type { Db } from './client'
import { appendEventIn, hunterState, requireHunter, type Hunter, type Tx } from './hunters'
import { hunters as schemaHunters, penalties, questTemplates, quests } from './schema'
import { localDayKey, nextResetAfter } from '@/domain/clock'
import {
  computeQuestReward,
  fullClearBonus,
  repetitionContextFrom,
  repetitionMultiplier,
  selectDailyTemplates,
} from '@/domain/quests'
import { activeDebuffMultiplier, evaluateDeadlines, evaluatePenaltyLapses } from '@/domain/penalty'
import type { QuestTemplate, Reward } from '@/domain/types'

export type QuestTemplateRow = typeof questTemplates.$inferSelect
export type QuestRow = typeof quests.$inferSelect
export type PenaltyRow = typeof penalties.$inferSelect

/** Adapt a stored row to the shape the pure domain expects. */
function toDomainTemplate(row: QuestTemplateRow): QuestTemplate {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    track: row.track,
    tier: row.tier,
    statRewards: row.statRewards,
    baseXp: row.baseXp,
    baseGold: row.baseGold,
    isCore: row.isCore,
    enabled: row.enabled,
  }
}

function toDomainQuest(q: QuestRow) {
  return {
    id: q.id,
    templateId: q.templateId,
    issuedAt: q.issuedAt,
    dueAt: q.dueAt,
    status: q.status,
    completedAt: q.completedAt,
  }
}

function toDomainPenalty(p: PenaltyRow) {
  return {
    id: p.id,
    sourceQuestId: p.sourceQuestId,
    issuedAt: p.issuedAt,
    dueAt: p.dueAt,
    requirement: p.requirement,
    status: p.status,
    resolvedAt: p.resolvedAt,
    escalation: p.escalation,
  }
}

export function dayKeyFor(hunter: Hunter, now: number): string {
  return localDayKey(now, hunter.dailyResetHour, hunter.timezone)
}

export function listTemplates(db: Db, hunterId: string): QuestTemplateRow[] {
  return db.select().from(questTemplates).where(eq(questTemplates.hunterId, hunterId)).all()
}

export function activePenalties(db: Db, hunterId: string): PenaltyRow[] {
  return db
    .select()
    .from(penalties)
    .where(and(eq(penalties.hunterId, hunterId), eq(penalties.status, 'ACTIVE')))
    .all()
}

/** Debuff currently applied to every reward, from outstanding penalties. */
export function currentDebuff(db: Db, hunter: Hunter): number {
  return activeDebuffMultiplier(activePenalties(db, hunter.id), hunter.difficulty)
}

/**
 * The quests whose failure opened a given penalty.
 *
 * A penalty is issued at the instant a deadline passed, so the quests it is
 * about are the ones that were FAILED at exactly that instant — not whatever
 * happens to be failed today, which is a different (and usually empty) set.
 */
export function questsFailedAt(db: Db, hunterId: string, deadline: number): QuestRow[] {
  return db
    .select()
    .from(quests)
    .where(
      and(
        eq(quests.hunterId, hunterId),
        eq(quests.status, 'FAILED'),
        eq(quests.dueAt, deadline),
      ),
    )
    .all()
}

export function questsForDay(db: Db, hunterId: string, dayKey: string): QuestRow[] {
  return db
    .select()
    .from(quests)
    .where(and(eq(quests.hunterId, hunterId), eq(quests.dayKey, dayKey)))
    .all()
}

/** System days on which a template was completed. */
export function completionDayKeys(db: Db, hunterId: string, templateId: string): string[] {
  return db
    .select({ dayKey: quests.dayKey })
    .from(quests)
    .where(
      and(
        eq(quests.hunterId, hunterId),
        eq(quests.templateId, templateId),
        eq(quests.status, 'COMPLETE'),
      ),
    )
    .all()
    .map((r) => r.dayKey)
}

/** System days since a template was last completed, for the issuance weighting. */
function daysSinceLastMap(db: Db, hunterId: string, todayKey: string): Map<string, number> {
  const rows = db
    .select({ templateId: quests.templateId, dayKey: quests.dayKey })
    .from(quests)
    .where(and(eq(quests.hunterId, hunterId), eq(quests.status, 'COMPLETE')))
    .all()

  const out = new Map<string, number>()
  for (const r of rows) {
    const ctx = repetitionContextFrom([r.dayKey], todayKey)
    if (ctx.daysSinceLast === null) continue
    const prev = out.get(r.templateId)
    if (prev === undefined || ctx.daysSinceLast < prev) out.set(r.templateId, ctx.daysSinceLast)
  }
  return out
}

/**
 * Issue today's quests if they have not been issued yet.
 *
 * Idempotent: the unique index on (hunter, template, day) means a double call
 * cannot produce a double set, and the seeded selection means a refresh cannot
 * reroll the day into something easier.
 */
export function issueQuestsForDay(db: Db, hunterId: string, now: number): QuestRow[] {
  const hunter = requireHunter(db, hunterId)
  const dayKey = dayKeyFor(hunter, now)

  const existing = questsForDay(db, hunterId, dayKey)
  if (existing.length > 0) return existing

  const templates = listTemplates(db, hunterId).map(toDomainTemplate)
  const chosen = selectDailyTemplates({
    templates,
    dayKey,
    daysSinceLast: daysSinceLastMap(db, hunterId, dayKey),
    rotatingCount: hunter.rotatingQuestCount,
  })
  if (chosen.length === 0) return []

  const dueAt = nextResetAfter(now, hunter.dailyResetHour, hunter.timezone)

  return db.transaction((tx) => {
    for (const t of chosen) {
      const ctx = repetitionContextFrom(completionDayKeys(db, hunterId, t.id), dayKey)
      tx.insert(quests)
        .values({
          id: crypto.randomUUID(),
          hunterId,
          templateId: t.id,
          dayKey,
          issuedAt: now,
          dueAt,
          status: 'ISSUED',
          completedAt: null,
          evidenceId: null,
          awardedXp: 0,
          multiplierMilli: Math.round(repetitionMultiplier(ctx) * 1000),
        })
        .run()
    }
    return tx
      .select()
      .from(quests)
      .where(and(eq(quests.hunterId, hunterId), eq(quests.dayKey, dayKey)))
      .all()
  })
}

export interface CompletionResult {
  readonly reward: Reward
  readonly fullClear: Reward | null
  readonly leveledUp: boolean
  readonly levelAfter: number
}

/** Complete a quest and pay for it at whatever rate it is currently worth. */
export function completeQuest(
  db: Db,
  questId: string,
  now: number,
  evidenceId: string | null = null,
): CompletionResult {
  const quest = db.select().from(quests).where(eq(quests.id, questId)).get()
  if (!quest) throw new Error(`no quest ${questId}`)
  if (quest.status !== 'ISSUED') throw new Error(`quest ${questId} is already ${quest.status}`)
  if (now > quest.dueAt) throw new Error(`quest ${questId} is past its deadline`)

  const hunter = requireHunter(db, quest.hunterId)
  const templateRow = db
    .select()
    .from(questTemplates)
    .where(eq(questTemplates.id, quest.templateId))
    .get()
  if (!templateRow) throw new Error(`no template ${quest.templateId}`)

  const ctx = repetitionContextFrom(
    completionDayKeys(db, quest.hunterId, quest.templateId),
    quest.dayKey,
  )
  const reward = computeQuestReward(toDomainTemplate(templateRow), ctx, currentDebuff(db, hunter))
  const levelBefore = hunterState(hunter).level

  return db.transaction((tx) => {
    tx.update(quests)
      .set({ status: 'COMPLETE', completedAt: now, evidenceId, awardedXp: reward.xp })
      .where(eq(quests.id, questId))
      .run()

    appendEventIn(tx, {
      hunterId: quest.hunterId,
      at: now,
      source: 'QUEST',
      sourceId: questId,
      xp: reward.xp,
      gold: reward.gold,
      excelia: reward.stats,
      note: templateRow.title,
    })

    // Full clear: every quest issued today is now complete.
    const today = tx
      .select()
      .from(quests)
      .where(and(eq(quests.hunterId, quest.hunterId), eq(quests.dayKey, quest.dayKey)))
      .all()

    let fullClear: Reward | null = null
    if (today.length > 0 && today.every((q) => q.status === 'COMPLETE')) {
      fullClear = fullClearBonus(today.map((q) => ({ xp: q.awardedXp, gold: 0, stats: {} })))
      if (fullClear.xp > 0) {
        appendEventIn(tx, {
          hunterId: quest.hunterId,
          at: now,
          source: 'FULL_CLEAR',
          sourceId: quest.dayKey,
          xp: fullClear.xp,
          note: `Full clear — ${quest.dayKey}`,
        })
      }
    }

    const after = hunterState(requireHunterIn(tx, quest.hunterId))
    return { reward, fullClear, leveledUp: after.level > levelBefore, levelAfter: after.level }
  })
}

function requireHunterIn(tx: Tx, id: string): Hunter {
  const rows = tx.select().from(schemaHunters).where(eq(schemaHunters.id, id)).get()
  if (!rows) throw new Error(`no hunter ${id}`)
  return rows
}

export interface SweepResult {
  readonly failedQuestIds: readonly string[]
  readonly penaltiesIssued: number
  readonly penaltiesEscalated: number
}

/**
 * Fail everything overdue, issue the penalties, and escalate any penalty that
 * was itself allowed to lapse. Safe to call on every page load.
 */
export function sweepDeadlines(db: Db, hunterId: string, now: number): SweepResult {
  const openQuests = db
    .select()
    .from(quests)
    .where(and(eq(quests.hunterId, hunterId), eq(quests.status, 'ISSUED'), lte(quests.dueAt, now)))
    .all()

  const titleFor = new Map(
    listTemplates(db, hunterId).map((t) => [t.id, t.title] as const),
  )

  const open = activePenalties(db, hunterId)

  const deadlines = evaluateDeadlines(
    openQuests.map(toDomainQuest),
    now,
    open.map(toDomainPenalty),
    (missed) => {
      const names = missed.map((q) => `"${titleFor.get(q.templateId) ?? q.templateId}"`)
      const list = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
      return `Clear ${list} again, and prove it.`
    },
  )

  const lapses = evaluatePenaltyLapses(open.map(toDomainPenalty), now)

  const drafts = [
    ...(deadlines.penalty ? [deadlines.penalty] : []),
    ...lapses.replacements,
  ]

  if (deadlines.failedQuestIds.length === 0 && lapses.expiredIds.length === 0) {
    return { failedQuestIds: [], penaltiesIssued: 0, penaltiesEscalated: 0 }
  }

  db.transaction((tx) => {
    if (deadlines.failedQuestIds.length > 0) {
      tx.update(quests)
        .set({ status: 'FAILED' })
        .where(inArray(quests.id, [...deadlines.failedQuestIds]))
        .run()
    }
    if (lapses.expiredIds.length > 0) {
      tx.update(penalties)
        .set({ status: 'EXPIRED' })
        .where(inArray(penalties.id, [...lapses.expiredIds]))
        .run()
    }
    for (const draft of drafts) {
      tx.insert(penalties)
        .values({
          id: crypto.randomUUID(),
          hunterId,
          sourceQuestId: draft.sourceQuestId,
          issuedAt: draft.issuedAt,
          dueAt: draft.dueAt,
          requirement: draft.requirement,
          status: 'ACTIVE',
          resolvedAt: null,
          evidenceId: null,
          escalation: draft.escalation,
        })
        .run()
    }
  })

  return {
    failedQuestIds: deadlines.failedQuestIds,
    penaltiesIssued: deadlines.penalty ? 1 : 0,
    penaltiesEscalated: lapses.replacements.length,
  }
}

/**
 * Clear a penalty. Evidence is mandatory: the System does not take atonement
 * on trust, and this is the one place in Phase 1 where that rule bites.
 */
export function resolvePenaltyWithEvidence(
  db: Db,
  penaltyId: string,
  evidenceId: string,
  now: number,
): PenaltyRow {
  if (!evidenceId) throw new Error('a penalty cannot be cleared without evidence')

  const p = db.select().from(penalties).where(eq(penalties.id, penaltyId)).get()
  if (!p) throw new Error(`no penalty ${penaltyId}`)
  if (p.status !== 'ACTIVE') throw new Error(`penalty ${penaltyId} is ${p.status}, not active`)

  db.update(penalties)
    .set({ status: 'RESOLVED', resolvedAt: now, evidenceId })
    .where(eq(penalties.id, penaltyId))
    .run()

  const updated = db.select().from(penalties).where(eq(penalties.id, penaltyId)).get()
  if (!updated) throw new Error(`penalty ${penaltyId} vanished`)
  return updated
}
