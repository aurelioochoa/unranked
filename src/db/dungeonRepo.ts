/**
 * Instant Dungeons.
 *
 * Nothing here ever accepts an elapsed time from a caller. A run is created
 * with a server timestamp and resolved against a server timestamp; the client
 * can only say "I am clearing" or "I am fleeing". That is what makes the
 * dungeon the one mechanic in the System that is verified rather than trusted.
 */

import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from './client'
import { appendEventIn, hunterState, requireHunter } from './hunters'
import { dungeonRuns, inventory, systemLog } from './schema'
import { currentDebuff } from './questRepo'
import {
  clearRun,
  createRun,
  expireRun,
  fleeRun,
  runState,
  type RunState,
} from '@/domain/dungeon'
import { rollLoot, type LootItem } from '@/domain/loot'
import type { DungeonRun, Reward, Track } from '@/domain/types'

export type DungeonRunRow = typeof dungeonRuns.$inferSelect

function toDomain(row: DungeonRunRow): DungeonRun {
  return {
    id: row.id,
    objective: row.objective,
    track: row.track,
    startedAt: row.startedAt,
    plannedMs: row.plannedMs,
    endedAt: row.endedAt,
    outcome: row.outcome,
  }
}

/** The run still open, if any. Only one dungeon may be entered at a time. */
export function openRun(db: Db, hunterId: string, now: number): DungeonRunRow | undefined {
  const rows = db
    .select()
    .from(dungeonRuns)
    .where(and(eq(dungeonRuns.hunterId, hunterId), isNull(dungeonRuns.outcome)))
    .all()
  return rows.find((r) => {
    const s = runState(toDomain(r), now)
    return s === 'ACTIVE' || s === 'CLEARABLE'
  })
}

export function stateOf(row: DungeonRunRow, now: number): RunState {
  return runState(toDomain(row), now)
}

export function startRun(
  db: Db,
  hunterId: string,
  input: { objective: string; track: Track; plannedMs: number },
  now: number,
): DungeonRunRow {
  requireHunter(db, hunterId)
  if (openRun(db, hunterId, now)) {
    throw new Error('a dungeon is already open — clear it or flee before entering another')
  }

  // createRun validates the objective and duration before anything is written.
  const run = createRun({ id: crypto.randomUUID(), ...input }, now)

  db.insert(dungeonRuns)
    .values({
      id: run.id,
      hunterId,
      objective: run.objective,
      track: run.track,
      startedAt: run.startedAt,
      plannedMs: run.plannedMs,
      endedAt: null,
      outcome: null,
      awardedXp: 0,
    })
    .run()

  const row = db.select().from(dungeonRuns).where(eq(dungeonRuns.id, run.id)).get()
  if (!row) throw new Error('dungeon vanished immediately after creation')
  return row
}

export interface RunResult {
  readonly run: DungeonRunRow
  readonly reward: Reward
  readonly loot: readonly LootItem[]
  readonly leveledUp: boolean
  readonly levelAfter: number
}

type Resolver = typeof clearRun

function resolve(db: Db, runId: string, now: number, resolver: Resolver): RunResult {
  const row = db.select().from(dungeonRuns).where(eq(dungeonRuns.id, runId)).get()
  if (!row) throw new Error(`no dungeon ${runId}`)

  const hunter = requireHunter(db, row.hunterId)
  const levelBefore = hunterState(hunter).level
  const outcome = resolver(toDomain(row), now, currentDebuff(db, hunter))
  const loot = rollLoot(`${runId}:${outcome.run.outcome}`, outcome.lootRolls)

  return db.transaction((tx) => {
    tx.update(dungeonRuns)
      .set({
        endedAt: outcome.run.endedAt,
        outcome: outcome.run.outcome,
        awardedXp: outcome.reward.xp,
      })
      .where(eq(dungeonRuns.id, runId))
      .run()

    appendEventIn(tx, {
      hunterId: row.hunterId,
      at: now,
      source: 'DUNGEON',
      sourceId: runId,
      xp: outcome.reward.xp,
      gold: outcome.reward.gold,
      excelia: outcome.reward.stats,
      note: `${outcome.run.outcome}: ${row.objective}`,
    })

    for (const item of loot) {
      tx.insert(inventory)
        .values({
          id: crypto.randomUUID(),
          hunterId: row.hunterId,
          lootId: item.id,
          acquiredAt: now,
          sourceId: runId,
          consumedAt: null,
        })
        .run()
    }

    const updated = tx.select().from(dungeonRuns).where(eq(dungeonRuns.id, runId)).get()
    if (!updated) throw new Error(`dungeon ${runId} vanished mid-transaction`)
    const after = hunterState(requireHunter(db, row.hunterId))
    return {
      run: updated,
      reward: outcome.reward,
      loot,
      leveledUp: after.level > levelBefore,
      levelAfter: after.level,
    }
  })
}

export const clearRunById = (db: Db, runId: string, now: number): RunResult =>
  resolve(db, runId, now, clearRun)

export const fleeRunById = (db: Db, runId: string, now: number): RunResult =>
  resolve(db, runId, now, fleeRun)

/** Close out any run left open past its grace window. Safe to call anytime. */
export function sweepExpiredRuns(db: Db, hunterId: string, now: number): RunResult[] {
  const stale = db
    .select()
    .from(dungeonRuns)
    .where(and(eq(dungeonRuns.hunterId, hunterId), isNull(dungeonRuns.outcome)))
    .all()
    .filter((r) => stateOf(r, now) === 'EXPIRED')

  return stale.map((r) => resolve(db, r.id, now, expireRun))
}

export function logSystem(
  db: Db,
  hunterId: string,
  kind: string,
  message: string,
  opts: { at?: number; generated?: boolean; spoken?: boolean } = {},
): void {
  db.insert(systemLog)
    .values({
      id: crypto.randomUUID(),
      hunterId,
      at: opts.at ?? Date.now(),
      kind,
      message,
      generated: opts.generated ?? false,
      spoken: opts.spoken ?? false,
    })
    .run()
}
