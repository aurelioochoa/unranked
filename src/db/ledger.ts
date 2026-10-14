/**
 * The fold.
 *
 * `stat_events` is append-only and authoritative; the counters on `hunters` are
 * a cache of this function applied to every event. Keeping the fold as a pure
 * function of the rows means the cache can be rebuilt at any time, a balance
 * change can be replayed over real history, and the invariant
 * "cache === fold(ledger)" is directly assertable in a test.
 */

import {
  effectiveStats,
  levelForTotalXp,
  pointsGrantedThrough,
  progressInLevel,
  type LevelProgress,
} from '@/domain/stats'
import { STATS, ZERO_STATS, type Stat, type StatBlock } from '@/domain/types'

export interface LedgerEntry {
  readonly xp: number
  readonly gold: number
  readonly excelia: Partial<Record<Stat, number>>
  readonly allocated: Partial<Record<Stat, number>>
}

export interface LedgerFold {
  readonly totalXp: number
  readonly gold: number
  readonly allocated: StatBlock
  readonly excelia: StatBlock
  readonly spentPoints: number
}

export const EMPTY_FOLD: LedgerFold = Object.freeze({
  totalXp: 0,
  gold: 0,
  allocated: ZERO_STATS,
  excelia: ZERO_STATS,
  spentPoints: 0,
})

/** Replay a ledger into a set of counters. */
export function foldEvents(entries: Iterable<LedgerEntry>): LedgerFold {
  let totalXp = 0
  let gold = 0
  const allocated: Record<Stat, number> = { ...ZERO_STATS }
  const excelia: Record<Stat, number> = { ...ZERO_STATS }

  for (const e of entries) {
    totalXp += e.xp
    gold += e.gold
    for (const s of STATS) {
      allocated[s] += e.allocated[s] ?? 0
      excelia[s] += e.excelia[s] ?? 0
    }
  }

  const spentPoints = STATS.reduce((sum, s) => sum + allocated[s], 0)
  return { totalXp, gold, allocated, excelia, spentPoints }
}

export interface DerivedState {
  readonly level: number
  readonly progress: LevelProgress
  readonly unspentPoints: number
  /** What the Status window shows: allocated points plus points earned. */
  readonly stats: StatBlock
  readonly gold: number
  readonly totalXp: number
}

/** Everything the Status window needs, derived from the fold and nothing else. */
export function deriveState(fold: LedgerFold): DerivedState {
  const level = levelForTotalXp(fold.totalXp)
  return {
    level,
    progress: progressInLevel(fold.totalXp),
    unspentPoints: pointsGrantedThrough(level) - fold.spentPoints,
    stats: effectiveStats(fold.allocated, fold.excelia),
    gold: fold.gold,
    totalXp: fold.totalXp,
  }
}

/** Drop zero entries so stored JSON stays sparse and readable. */
export function compactDelta(
  delta: Partial<Record<Stat, number>>,
): Partial<Record<Stat, number>> {
  const out: Partial<Record<Stat, number>> = {}
  for (const s of STATS) {
    const v = delta[s]
    if (v !== undefined && v !== 0) out[s] = v
  }
  return out
}
