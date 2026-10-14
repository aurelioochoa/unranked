/**
 * Levels, XP and stat points.
 *
 * Level is *derived* from lifetime XP rather than stored, so the ledger in
 * `stat_events` is the single source of truth and a curve rebalance can be
 * replayed over history instead of migrating everyone's numbers by hand.
 */

import { STATS, ZERO_STATS, type Stat, type StatBlock } from './types'

/** Hard ceiling. Not a balance decision — a guard against unbounded loops. */
export const MAX_LEVEL = 300

const XP_BASE = 100
const XP_EXPONENT = 1.35

const POINTS_PER_LEVEL = 3
const MILESTONE_EVERY = 10
const MILESTONE_BONUS = 2

/** XP required to climb from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level >= MAX_LEVEL) {
    throw new RangeError(`level must be an integer in [1, ${MAX_LEVEL}), got ${level}`)
  }
  return Math.round(XP_BASE * Math.pow(level, XP_EXPONENT))
}

/** Cumulative XP thresholds, index = level. Built once, read forever. */
const cumulative: number[] = (() => {
  const table = new Array<number>(MAX_LEVEL + 1)
  table[0] = 0
  table[1] = 0
  let running = 0
  for (let level = 1; level < MAX_LEVEL; level++) {
    running += xpToNext(level)
    table[level + 1] = running
  }
  return table
})()

/** Lifetime XP needed to have reached `level`. Level 1 is free. */
export function totalXpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`level must be an integer in [1, ${MAX_LEVEL}], got ${level}`)
  }
  return cumulative[level]!
}

/** The level a hunter with `totalXp` lifetime XP has reached. */
export function levelForTotalXp(totalXp: number): number {
  if (!(totalXp > 0)) return 1
  // Binary search the threshold table: the highest level whose cost is covered.
  let lo = 1
  let hi = MAX_LEVEL
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (cumulative[mid]! <= totalXp) lo = mid
    else hi = mid - 1
  }
  return lo
}

export interface LevelProgress {
  readonly level: number
  /** XP earned since reaching the current level. */
  readonly into: number
  /** XP the current level costs in total. */
  readonly need: number
  /** `into / need`, clamped to [0, 1]. */
  readonly fraction: number
}

export function progressInLevel(totalXp: number): LevelProgress {
  const level = levelForTotalXp(totalXp)
  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, into: 0, need: 0, fraction: 1 }
  }
  const into = Math.max(0, totalXp) - totalXpForLevel(level)
  const need = xpToNext(level)
  return { level, into, need, fraction: need === 0 ? 1 : Math.min(1, into / need) }
}

/** Stat points granted for reaching `level`. Awakening at level 1 grants none. */
export function pointsForReaching(level: number): number {
  if (level <= 1) return 0
  return POINTS_PER_LEVEL + (level % MILESTONE_EVERY === 0 ? MILESTONE_BONUS : 0)
}

/** Total stat points granted on the way from level 1 to `level`. */
export function pointsGrantedThrough(level: number): number {
  let total = 0
  for (let l = 2; l <= level; l++) total += pointsForReaching(l)
  return total
}

export interface XpResult {
  readonly totalXp: number
  readonly levelBefore: number
  readonly levelAfter: number
  readonly pointsGranted: number
  readonly leveledUp: boolean
}

/**
 * Award XP. Handles crossing several thresholds at once — a long dungeon run
 * genuinely can take you up two levels, and it should feel like it.
 */
export function applyXp(totalXpBefore: number, amount: number): XpResult {
  if (amount < 0) throw new RangeError('cannot award negative xp')
  const levelBefore = levelForTotalXp(totalXpBefore)
  const totalXp = totalXpBefore + amount
  const levelAfter = levelForTotalXp(totalXp)
  return {
    totalXp,
    levelBefore,
    levelAfter,
    pointsGranted: pointsGrantedThrough(levelAfter) - pointsGrantedThrough(levelBefore),
    leveledUp: levelAfter > levelBefore,
  }
}

/** Sum of all six stats. */
export function statTotal(stats: StatBlock): number {
  return STATS.reduce((sum, s) => sum + stats[s], 0)
}

/** Add a partial award onto a stat block, returning a new block. */
export function addStats(base: StatBlock, delta: Partial<Record<Stat, number>>): StatBlock {
  const out: Record<Stat, number> = { ...ZERO_STATS }
  for (const s of STATS) out[s] = base[s] + (delta[s] ?? 0)
  return out
}

export interface AllocationResult {
  readonly stats: StatBlock
  readonly unspentPoints: number
}

/**
 * Spend level-up points into stats.
 *
 * Deliberately manual: choosing where the points go is the most satisfying beat
 * in the source material, and automating it throws that away.
 */
export function allocatePoints(
  stats: StatBlock,
  unspentPoints: number,
  spend: Partial<Record<Stat, number>>,
): AllocationResult {
  let requested = 0
  for (const s of STATS) {
    const v = spend[s]
    if (v === undefined) continue
    if (!Number.isInteger(v) || v < 0) {
      throw new RangeError(`${s} allocation must be a non-negative integer, got ${v}`)
    }
    requested += v
  }
  if (requested > unspentPoints) {
    throw new RangeError(`not enough points: tried to spend ${requested} of ${unspentPoints}`)
  }
  return { stats: addStats(stats, spend), unspentPoints: unspentPoints - requested }
}

// ---------------------------------------------------------------------------
// Excelia — stats earned through deeds
// ---------------------------------------------------------------------------
//
// Borrowed from DanMachi's Falna. Quests do not hand you whole stat points;
// they deposit excelia into the stat the deed exercised. Enough excelia becomes
// a point. This is what makes tracks mean something: lifting genuinely grows
// STR, and no amount of reading will do it for you.
//
// Level-up points stay separate and stay manual — they are yours to place.

export const EXCELIA_PER_POINT = 100

/** Whole stat points earned from an excelia counter. */
export function pointsFromExcelia(excelia: number): number {
  if (!(excelia > 0)) return 0
  return Math.floor(excelia / EXCELIA_PER_POINT)
}

export interface ExceliaProgress {
  readonly points: number
  readonly into: number
  readonly need: number
  readonly fraction: number
}

export function exceliaProgress(excelia: number): ExceliaProgress {
  const safe = Math.max(0, excelia)
  const points = pointsFromExcelia(safe)
  const into = safe - points * EXCELIA_PER_POINT
  return { points, into, need: EXCELIA_PER_POINT, fraction: into / EXCELIA_PER_POINT }
}

/** What the Status window shows: points you placed plus points you earned. */
export function effectiveStats(allocated: StatBlock, excelia: StatBlock): StatBlock {
  const out: Record<Stat, number> = { ...ZERO_STATS }
  for (const s of STATS) out[s] = allocated[s] + pointsFromExcelia(excelia[s])
  return out
}
