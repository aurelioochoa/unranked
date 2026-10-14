/**
 * The Penalty Zone.
 *
 * Faithful to the source in shape — miss the Daily Quest and something bad
 * happens, immediately — but built so nothing is ever permanently destroyed.
 * That is the line the design draws: penalties sting, escalate while ignored,
 * and always have a way out. Habitica's damage mechanics are the single most
 * cited reason people abandon this genre; a debuff you can always clear is the
 * version of stakes that survives month two.
 *
 * A lapsed penalty is not forgiven and does not simply vanish: it expires and
 * is replaced by a heavier one. The System does not give up on you.
 */

import type { Difficulty, Penalty, Quest } from './types'

export const HOUR_MS = 3_600_000
/** How long you have to clear a penalty before it is replaced by a worse one. */
export const PENALTY_WINDOW_MS = 24 * HOUR_MS

/** Fraction of all earnings withheld while one fresh penalty is outstanding. */
export const BASE_SEVERITY: Readonly<Record<Difficulty, number>> = Object.freeze({
  NORMAL: 0.1,
  HARD: 0.2,
  MONARCH: 0.35,
})

/** Added severity per time a penalty has been allowed to lapse. */
export const ESCALATION_STEP = 0.05
/** Added severity per additional penalty outstanding beyond the first. */
export const STACK_STEP = 0.05
/** The floor of the hole. Earnings are never reduced past this. */
export const MAX_SEVERITY = 0.6

export interface PenaltyDraft {
  readonly sourceQuestId: string
  readonly issuedAt: number
  readonly dueAt: number
  readonly requirement: string
  readonly escalation: number
}

export interface DeadlineEvaluation {
  readonly failedQuestIds: readonly string[]
  /** At most one. Null when nothing lapsed, or when a penalty is already open. */
  readonly penalty: PenaltyDraft | null
}

function defaultRequirement(missed: readonly Quest[]): string {
  const names = missed.map((q) => q.templateId).join(', ')
  return `Clear what you abandoned (${names}), and prove it.`
}

/**
 * Fail everything overdue and, if warranted, open a Penalty Zone.
 *
 * Two rules here are load-bearing, and both were written after watching a
 * 30-day simulation produce 67 concurrent penalties:
 *
 * 1. **One penalty per lapse, not one per quest.** A bad day is one failure to
 *    complete the Daily Quest, exactly as in the source material — not five
 *    separate atonements. Per-quest penalties turn a single off day into a
 *    backlog no one can clear, which is the documented reason people abandon
 *    this whole genre of app.
 *
 * 2. **Never more than one open at a time.** You are in the Penalty Zone or
 *    you are not. Ignoring it escalates the one you have (see
 *    `evaluatePenaltyLapses`); it never spawns a second. Escalation carries
 *    the weight that stacking otherwise would, and it stays clearable.
 *
 * The window runs from the EARLIEST missed deadline, not from the moment the
 * app happened to notice. Opening the System after two days away must not
 * quietly hand you a fresh 24 hours.
 */
export function evaluateDeadlines(
  quests: readonly Quest[],
  now: number,
  openPenalties: readonly Penalty[] = [],
  requirementFor: (missed: readonly Quest[]) => string = defaultRequirement,
): DeadlineEvaluation {
  const missed = quests.filter((q) => q.status === 'ISSUED' && q.dueAt <= now)
  if (missed.length === 0) return { failedQuestIds: [], penalty: null }

  const failedQuestIds = missed.map((q) => q.id)

  // Already in the Penalty Zone: the failures stand on the record, but the
  // consequence is the one already outstanding.
  if (openPenalties.some((p) => p.status === 'ACTIVE')) {
    return { failedQuestIds, penalty: null }
  }

  const issuedAt = Math.min(...missed.map((q) => q.dueAt))
  return {
    failedQuestIds,
    penalty: {
      sourceQuestId: missed[0]!.id,
      issuedAt,
      dueAt: issuedAt + PENALTY_WINDOW_MS,
      requirement: requirementFor(missed),
      escalation: 0,
    },
  }
}

export interface LapseEvaluation {
  readonly expiredIds: readonly string[]
  readonly replacements: readonly PenaltyDraft[]
}

/** Expire penalties whose window ran out, and re-issue each one heavier. */
export function evaluatePenaltyLapses(penalties: readonly Penalty[], now: number): LapseEvaluation {
  const expiredIds: string[] = []
  const replacements: PenaltyDraft[] = []

  for (const p of penalties) {
    if (p.status !== 'ACTIVE') continue
    if (p.dueAt > now) continue
    expiredIds.push(p.id)
    replacements.push({
      sourceQuestId: p.sourceQuestId,
      issuedAt: p.dueAt,
      dueAt: p.dueAt + PENALTY_WINDOW_MS,
      requirement: p.requirement,
      escalation: p.escalation + 1,
    })
  }

  return { expiredIds, replacements }
}

/**
 * The multiplier every reward passes through while penalties are outstanding.
 *
 * Stacking is sub-linear and hard-capped: five outstanding penalties hurt more
 * than one, but the System never reduces a day's work to nothing.
 */
export function activeDebuffMultiplier(
  penalties: readonly Penalty[],
  difficulty: Difficulty,
): number {
  const active = penalties.filter((p) => p.status === 'ACTIVE')
  if (active.length === 0) return 1

  const escalations = active.reduce((sum, p) => sum + p.escalation, 0)
  const severity =
    BASE_SEVERITY[difficulty] +
    ESCALATION_STEP * escalations +
    STACK_STEP * (active.length - 1)

  return 1 - Math.min(severity, MAX_SEVERITY)
}

/** Clear a penalty. Only an active one can be cleared. */
export function resolvePenalty(penalty: Penalty, now: number): Penalty {
  if (penalty.status !== 'ACTIVE') {
    throw new Error(`only an active penalty can be resolved (${penalty.id} is ${penalty.status})`)
  }
  return { ...penalty, status: 'RESOLVED', resolvedAt: now }
}

/**
 * Scars stay on the record forever. Nothing is lost, but nothing is hidden
 * either — the point of a recoverable penalty is that the recovery is visible.
 */
export function isScar(quest: Quest): boolean {
  return quest.status === 'FAILED'
}
