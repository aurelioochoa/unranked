/**
 * Instant Dungeons — "ID Create", from The Gamer.
 *
 * Declare an objective and a duration, enter a sealed instance, serve the time,
 * exit with loot. Leaving early is fleeing, and fleeing pays badly.
 *
 * This is the only mechanic in the System that is genuinely *verified* rather
 * than trusted. Elapsed time is derived solely from the persisted `startedAt`
 * and the server's clock — no client ever supplies a duration, so refreshing,
 * closing the tab, or editing local state cannot manufacture a cleared run.
 * That is precisely why dungeons pay the best rate in the app.
 */

import type { DungeonOutcome, DungeonRun, Reward, Stat, Track } from './types'
import { TRACK_STATS } from './types'

const MIN_MS = 60_000
const HOUR_MS = 3_600_000

export const MIN_DUNGEON_MS = 5 * MIN_MS
/** A single run cannot claim more than this, however long the tab stays open. */
export const MAX_DUNGEON_MS = 4 * HOUR_MS
/** How long after the planned end a run may still be closed as cleared. */
export const GRACE_MS = 1 * HOUR_MS

export const XP_PER_MINUTE = 4
export const GOLD_PER_MINUTE = 1
export const EXCELIA_PER_MINUTE = 1.5

/** Partial credit for time served before walking out. */
export const FLEE_RATE = 0.4
/** Credit for a run left open past its grace window — presence unverifiable. */
export const EXPIRY_RATE = 0.25
/** Runs at least this long earn a second loot roll. */
export const LONG_RUN_MS = 90 * MIN_MS

export type RunState = 'ACTIVE' | 'CLEARABLE' | 'EXPIRED' | 'CLOSED'

export interface CreateRunInput {
  readonly id: string
  readonly objective: string
  readonly track: Track
  readonly plannedMs: number
}

export function createRun(input: CreateRunInput, now: number): DungeonRun {
  const objective = input.objective.trim()
  if (objective.length === 0) {
    throw new RangeError('a dungeon needs an objective')
  }
  if (
    !Number.isFinite(input.plannedMs) ||
    input.plannedMs < MIN_DUNGEON_MS ||
    input.plannedMs > MAX_DUNGEON_MS
  ) {
    throw new RangeError(
      `duration must be between ${MIN_DUNGEON_MS}ms and ${MAX_DUNGEON_MS}ms, got ${input.plannedMs}`,
    )
  }
  return {
    id: input.id,
    objective,
    track: input.track,
    startedAt: now,
    plannedMs: input.plannedMs,
    endedAt: null,
    outcome: null,
  }
}

/** Time actually served, from the persisted start alone. */
export function elapsedMs(run: DungeonRun, now: number): number {
  return Math.max(0, now - run.startedAt)
}

export function runState(run: DungeonRun, now: number): RunState {
  if (run.outcome !== null) return 'CLOSED'
  const elapsed = elapsedMs(run, now)
  if (elapsed < run.plannedMs) return 'ACTIVE'
  if (elapsed < run.plannedMs + GRACE_MS) return 'CLEARABLE'
  return 'EXPIRED'
}

export interface RunResolution {
  readonly run: DungeonRun
  readonly reward: Reward
  readonly lootRolls: number
}

function rewardFor(track: Track, servedMs: number, rate: number, debuff: number): Reward {
  const minutes = servedMs / MIN_MS
  const factor = rate * debuff

  const targets = TRACK_STATS[track]
  const perStat = (minutes * EXCELIA_PER_MINUTE * factor) / targets.length
  const stats: Partial<Record<Stat, number>> = {}
  for (const s of targets) {
    const v = Math.round(perStat)
    if (v > 0) stats[s] = v
  }

  return {
    xp: Math.round(minutes * XP_PER_MINUTE * factor),
    gold: Math.round(minutes * GOLD_PER_MINUTE * factor),
    stats,
  }
}

function assertDebuff(debuff: number): void {
  if (!(debuff > 0) || debuff > 1) {
    throw new RangeError(`debuff multiplier must be in (0, 1], got ${debuff}`)
  }
}

function close(run: DungeonRun, now: number, outcome: DungeonOutcome): DungeonRun {
  return { ...run, endedAt: now, outcome }
}

/** Serve the full planned time and walk out with everything. */
export function clearRun(run: DungeonRun, now: number, debuffMultiplier = 1): RunResolution {
  assertDebuff(debuffMultiplier)
  const state = runState(run, now)
  if (state === 'CLOSED') throw new Error(`dungeon ${run.id} is already closed`)
  if (state === 'ACTIVE') throw new Error('the time has not served — flee instead, or stay')
  if (state === 'EXPIRED') throw new Error(`dungeon ${run.id} expired before it was closed`)

  // Overtime is not paid: the contract was the planned duration.
  const served = Math.min(elapsedMs(run, now), run.plannedMs)
  return {
    run: close(run, now, 'CLEARED'),
    reward: rewardFor(run.track, served, 1, debuffMultiplier),
    lootRolls: run.plannedMs >= LONG_RUN_MS ? 2 : 1,
  }
}

/** Walk out early. Partial credit for time actually served, and no loot. */
export function fleeRun(run: DungeonRun, now: number, debuffMultiplier = 1): RunResolution {
  assertDebuff(debuffMultiplier)
  if (runState(run, now) === 'CLOSED') throw new Error(`dungeon ${run.id} is already closed`)

  const served = Math.min(elapsedMs(run, now), run.plannedMs)
  return {
    run: close(run, now, 'FLED'),
    reward: rewardFor(run.track, served, FLEE_RATE, debuffMultiplier),
    lootRolls: 0,
  }
}

/**
 * Close a run nobody ever came back for. It pays something — you may well have
 * done the work — but not full rate, because nothing here can be verified.
 */
export function expireRun(run: DungeonRun, now: number, debuffMultiplier = 1): RunResolution {
  assertDebuff(debuffMultiplier)
  const state = runState(run, now)
  if (state === 'CLOSED') throw new Error(`dungeon ${run.id} is already closed`)
  if (state !== 'EXPIRED') throw new Error(`dungeon ${run.id} is not expired yet`)

  return {
    run: close(run, run.startedAt + run.plannedMs + GRACE_MS, 'EXPIRED'),
    reward: {
      ...rewardFor(run.track, run.plannedMs, EXPIRY_RATE, debuffMultiplier),
      gold: 0,
    },
    lootRolls: 0,
  }
}

/** Only one dungeon at a time. The grace window still counts as open. */
export function hasActiveRun(runs: readonly DungeonRun[], now: number): boolean {
  return runs.some((r) => {
    const s = runState(r, now)
    return s === 'ACTIVE' || s === 'CLEARABLE'
  })
}
