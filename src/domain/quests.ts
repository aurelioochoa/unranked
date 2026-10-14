/**
 * Quests, and the rule the whole app rests on: repetition pays less.
 *
 * Every gamified habit tracker in this genre dies the same way — by month two
 * the user is managing a character instead of building habits, because doing
 * exactly what you did yesterday keeps paying exactly what it paid yesterday.
 *
 * Borrowed from DanMachi: excelia decays when the challenge stops being one.
 * The System pays full rate for something new, decays a long identical streak
 * toward a floor, and pays a bonus again once a quest has gone stale enough to
 * be worth rediscovering. The floor exists because maintenance is not worthless
 * — it just is not growth.
 */

import { dayKeyOrdinal } from './clock'
import { hashSeed, makeRng, pickWeighted } from './random'
import type { QuestTemplate, Reward, Stat } from './types'
import { STATS } from './types'

/** The least a repeated quest can ever pay, as a fraction of base. */
export const DECAY_FLOOR = 0.25
/** Geometric decay applied per consecutive day of an unbroken streak. */
export const DECAY_RATE = 0.88
/** Paid the first time a quest is ever completed. */
export const NOVELTY_BONUS = 1.25
/** Paid when returning to a quest left alone long enough to be fresh again. */
export const REDISCOVERY_BONUS = 1.15
/** How many System days of absence make a quest fresh again. */
export const REDISCOVERY_DAYS = 14
/** Share of the day's XP awarded for clearing every issued quest. */
export const FULL_CLEAR_SHARE = 0.25

export interface RepetitionContext {
  /** Consecutive System days this template was completed, ending yesterday. */
  readonly priorStreak: number
  /** System days since the last completion; null if it has never been done. */
  readonly daysSinceLast: number | null
}

/**
 * How much of a quest's base value it is worth right now.
 *
 * Strictly decreasing in `priorStreak`, asymptotic to DECAY_FLOOR, and never
 * zero.
 */
export function repetitionMultiplier({ priorStreak, daysSinceLast }: RepetitionContext): number {
  if (!Number.isInteger(priorStreak) || priorStreak < 0) {
    throw new RangeError(`prior streak must be a non-negative integer, got ${priorStreak}`)
  }
  if (daysSinceLast === null) return NOVELTY_BONUS
  if (daysSinceLast >= REDISCOVERY_DAYS) return REDISCOVERY_BONUS
  return DECAY_FLOOR + (1 - DECAY_FLOOR) * Math.pow(DECAY_RATE, priorStreak)
}

/** Round a reward component without ever erasing it entirely. */
function scale(base: number, multiplier: number): number {
  if (base <= 0) return 0
  return Math.max(1, Math.round(base * multiplier))
}

/**
 * What completing this quest is worth, all multipliers applied.
 *
 * `debuffMultiplier` carries any active Penalty Zone debuff; it is a separate
 * argument rather than part of the context because it is a property of the
 * hunter's current state, not of this quest's history.
 */
export function computeQuestReward(
  template: QuestTemplate,
  ctx: RepetitionContext,
  debuffMultiplier = 1,
): Reward {
  if (!(debuffMultiplier > 0) || debuffMultiplier > 1) {
    throw new RangeError(`debuff multiplier must be in (0, 1], got ${debuffMultiplier}`)
  }
  const multiplier = repetitionMultiplier(ctx) * debuffMultiplier

  const stats: Partial<Record<Stat, number>> = {}
  for (const s of STATS) {
    const award = template.statRewards[s]
    if (award !== undefined && award > 0) stats[s] = scale(award, multiplier)
  }

  return {
    xp: scale(template.baseXp, multiplier),
    gold: scale(template.baseGold, multiplier),
    stats,
  }
}

/** Bonus for clearing every quest the System issued today. */
export function fullClearBonus(rewards: readonly Reward[]): Reward {
  const xp = rewards.reduce((sum, r) => sum + r.xp, 0)
  return { xp: Math.round(xp * FULL_CLEAR_SHARE), gold: 0, stats: {} }
}

export interface IssuanceContext {
  readonly templates: readonly QuestTemplate[]
  /** System day label, e.g. `2026-01-15`. Seeds the draw so refreshes are stable. */
  readonly dayKey: string
  /** System days since each template was last completed. Absent means never. */
  readonly daysSinceLast: ReadonlyMap<string, number>
  readonly rotatingCount: number
}

/** Neglect weighting: the longer since you did it, the likelier it is drawn. */
const MAX_STALENESS = 30

function staleness(id: string, daysSinceLast: ReadonlyMap<string, number>): number {
  const days = daysSinceLast.get(id)
  if (days === undefined) return MAX_STALENESS + 1 // never done — the freshest thing available
  return Math.min(Math.max(days, 0), MAX_STALENESS)
}

/**
 * Choose today's quests: every core daily, plus a weighted draw of rotating
 * ones biased toward whatever you have been avoiding.
 *
 * Seeded by the day label, so the set is fixed for the day and a page refresh
 * cannot reroll it into something easier.
 */
export function selectDailyTemplates(ctx: IssuanceContext): QuestTemplate[] {
  const enabled = ctx.templates.filter((t) => t.enabled)
  const core = enabled.filter((t) => t.isCore)
  const pool = enabled.filter((t) => !t.isCore)

  const rng = makeRng(hashSeed(`daily:${ctx.dayKey}`))
  const chosen: QuestTemplate[] = []
  const remaining = [...pool]
  const want = Math.min(Math.max(0, Math.trunc(ctx.rotatingCount)), remaining.length)

  for (let i = 0; i < want; i++) {
    // +1 so a quest completed today is unlikely rather than impossible.
    const picked = pickWeighted(remaining, (t) => staleness(t.id, ctx.daysSinceLast) + 1, rng)
    if (!picked) break
    chosen.push(picked)
    remaining.splice(remaining.indexOf(picked), 1)
  }

  return [...core, ...chosen]
}

/**
 * Turn a template's completion history into the context the decay rule needs.
 *
 * Only days strictly before `todayKey` count: this describes what you have
 * already done, not what you are about to do. If the last completion was not
 * yesterday, the streak is broken and the decay resets — which is the whole
 * bargain. Step away from something long enough and it becomes worth doing
 * properly again.
 */
export function repetitionContextFrom(
  completionDayKeys: readonly string[],
  todayKey: string,
): RepetitionContext {
  const today = dayKeyOrdinal(todayKey)
  const prior = [...new Set(completionDayKeys.map(dayKeyOrdinal))]
    .filter((o) => o < today)
    .sort((a, b) => b - a)

  const last = prior[0]
  if (last === undefined) return { priorStreak: 0, daysSinceLast: null }

  let priorStreak = 0
  if (last === today - 1) {
    let expected = last
    for (const o of prior) {
      if (o !== expected) break
      priorStreak++
      expected--
    }
  }

  return { priorStreak, daysSinceLast: today - last }
}
