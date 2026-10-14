/**
 * The app's seam onto the engine.
 *
 * Everything below this file is pure or persistence; everything above it is
 * React. This module is the only place that decides "what does the System look
 * like right now", and it is deliberately the place that runs the sweeps — so
 * opening any page is enough to make deadlines real, with no cron and no
 * background worker to forget about.
 */

import { getDb, type Db } from '@/db/client'
import {
  createHunter,
  getHunter,
  hunterState,
  requireHunter,
  type Hunter,
} from '@/db/hunters'
import {
  activePenalties,
  completionDayKeys,
  currentDebuff,
  dayKeyFor,
  issueQuestsForDay,
  listTemplates,
  questsForDay,
  sweepDeadlines,
  type PenaltyRow,
  type QuestRow,
  type QuestTemplateRow,
} from '@/db/questRepo'
import { openRun, stateOf, sweepExpiredRuns, type DungeonRunRow } from '@/db/dungeonRepo'
import { seedTemplates } from '@/db/seedTemplates'
import { nextResetAfter } from '@/domain/clock'
import { repetitionMultiplier, repetitionContextFrom } from '@/domain/quests'
import type { RunState } from '@/domain/dungeon'
import type { DerivedState } from '@/db/ledger'
import { aiConfigFromEnv, resolveAiConfig, type AiConfig } from '@/ai/config'

/** Single-hunter deployment today; the id is real so multi-user is a migration. */
export const HUNTER_ID = process.env.HUNTER_ID ?? 'solo'
const HUNTER_NAME = process.env.HUNTER_NAME ?? 'Hunter'

export function bootstrap(): { db: Db; hunter: Hunter } {
  const db = getDb()
  let hunter = getHunter(db, HUNTER_ID)
  if (!hunter) {
    hunter = createHunter(db, {
      id: HUNTER_ID,
      name: HUNTER_NAME,
      timezone: process.env.HUNTER_TIMEZONE ?? 'UTC',
      dailyResetHour: Number(process.env.DAILY_RESET_HOUR ?? 4),
    })
    seedTemplates(db, HUNTER_ID)
  }
  return { db, hunter }
}

export interface QuestView {
  readonly quest: QuestRow
  readonly template: QuestTemplateRow
  /** What this quest is worth right now, 1 = full value. */
  readonly multiplier: number
  readonly projectedXp: number
  /** Set when repetition has drained the value, for the UI to say so out loud. */
  readonly decayNote: string | null
}

export interface SystemView {
  readonly hunter: Hunter
  readonly state: DerivedState
  readonly dayKey: string
  readonly resetAt: number
  readonly quests: readonly QuestView[]
  readonly cleared: number
  readonly penalties: readonly PenaltyRow[]
  readonly debuff: number
  readonly openRun: DungeonRunRow | null
  readonly openRunState: RunState | null
  /** Environment merged with the hunter's own settings. Never carries the key. */
  readonly ai: AiConfig
}

function decayNoteFor(multiplier: number, streak: number, neverDone: boolean): string | null {
  if (neverDone) return 'Never attempted. Full value, and a novelty bonus.'
  if (multiplier >= 1) return null
  if (multiplier < 0.55) {
    return `${streak} days unbroken. Worth less each day — change it or escalate it.`
  }
  return `${streak} days running. The System is paying less for it.`
}

/**
 * Everything the UI needs, with the clock's consequences already applied.
 *
 * Order matters: sweep first so a missed deadline becomes a real penalty
 * before today's quests are issued and priced against the resulting debuff.
 */
/**
 * The AI configuration actually in force: what Settings says, over what the
 * environment says. The API key is never merged in from the database.
 */
export function effectiveAiConfig(hunter: Hunter): AiConfig {
  return resolveAiConfig(aiConfigFromEnv(), {
    provider: hunter.aiProvider,
    model: hunter.aiModel,
    baseUrl: hunter.aiBaseUrl,
    thinking: hunter.aiThinking,
    reasoningTokens: hunter.aiReasoningTokens,
    thinkingTimeoutMs: hunter.aiThinkingTimeoutMs,
    maxOutputTokens: hunter.aiMaxOutputTokens,
  })
}

export function loadSystem(now = Date.now()): SystemView {
  const { db } = bootstrap()

  /*
   * Nothing happens before the Awakening.
   *
   * The System routes redirect an un-awakened hunter, but Next renders the
   * layout that redirects and the page it wraps in the same pass — so this
   * function still ran, and issued a full day of quests against the seeded
   * defaults. The hunter then finished the ritual, chose their own core
   * dailies, and found the seeded ones on the board instead: a day's quests
   * are issued once, and today had already been spent before they answered.
   *
   * The sweeps are held back for the same reason. A deadline cannot be missed
   * by someone the System has not started keeping time for.
   */
  const awakened = requireHunter(db, HUNTER_ID).onboardedAt !== null
  if (awakened) {
    sweepDeadlines(db, HUNTER_ID, now)
    sweepExpiredRuns(db, HUNTER_ID, now)
    issueQuestsForDay(db, HUNTER_ID, now)
  }

  const hunter = requireHunter(db, HUNTER_ID)
  const dayKey = dayKeyFor(hunter, now)
  const templates = new Map(listTemplates(db, HUNTER_ID).map((t) => [t.id, t] as const))
  const debuff = currentDebuff(db, hunter)

  const quests: QuestView[] = []
  for (const quest of questsForDay(db, HUNTER_ID, dayKey)) {
    const template = templates.get(quest.templateId)
    if (!template) continue

    const history = completionDayKeys(db, HUNTER_ID, quest.templateId)
    const ctx = repetitionContextFrom(history, dayKey)
    const multiplier = repetitionMultiplier(ctx)

    quests.push({
      quest,
      template,
      multiplier,
      projectedXp: Math.max(1, Math.round(template.baseXp * multiplier * debuff)),
      decayNote: decayNoteFor(multiplier, ctx.priorStreak, ctx.daysSinceLast === null),
    })
  }

  // Core dailies first, then rotation; cleared quests sink to the bottom.
  quests.sort((a, b) => {
    const done = Number(a.quest.status !== 'ISSUED') - Number(b.quest.status !== 'ISSUED')
    if (done !== 0) return done
    const core = Number(b.template.isCore) - Number(a.template.isCore)
    if (core !== 0) return core
    return b.template.baseXp - a.template.baseXp
  })

  const run = openRun(db, HUNTER_ID, now) ?? null

  return {
    hunter,
    state: hunterState(hunter),
    dayKey,
    resetAt: nextResetAfter(now, hunter.dailyResetHour, hunter.timezone),
    quests,
    cleared: quests.filter((q) => q.quest.status === 'COMPLETE').length,
    penalties: activePenalties(db, HUNTER_ID),
    debuff,
    openRun: run,
    openRunState: run ? stateOf(run, now) : null,
    ai: effectiveAiConfig(hunter),
  }
}
