/**
 * Hunter state: the ledger, the cached fold, and settings.
 *
 * Every write to the ledger and its cache happens in one transaction, so the
 * invariant `hunters counters === fold(stat_events)` can never be observed
 * half-applied.
 */

import { eq } from 'drizzle-orm'
import type { Db } from './client'
import { compactDelta, deriveState, foldEvents, type DerivedState } from './ledger'
import { hunters, statEvents, type EventSource } from './schema'
import { STATS, ZERO_STATS, type Stat, type StatBlock } from '@/domain/types'

export type Hunter = typeof hunters.$inferSelect

/**
 * A drizzle transaction handle. Repositories that must write several tables
 * atomically open one transaction and pass it down, rather than nesting
 * transactions — SQLite cannot begin a transaction inside a transaction.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export interface EventInput {
  readonly hunterId: string
  readonly at: number
  readonly source: EventSource
  readonly sourceId?: string | null
  readonly xp?: number
  readonly gold?: number
  readonly excelia?: Partial<Record<Stat, number>>
  readonly allocated?: Partial<Record<Stat, number>>
  readonly note?: string | null
}

function toBlock(delta: Partial<Record<Stat, number>>): StatBlock {
  const out: Record<Stat, number> = { ...ZERO_STATS }
  for (const s of STATS) out[s] = delta[s] ?? 0
  return out
}

export function getHunter(db: Db, id: string): Hunter | undefined {
  return db.select().from(hunters).where(eq(hunters.id, id)).get()
}

export function requireHunter(db: Db, id: string): Hunter {
  const h = getHunter(db, id)
  if (!h) throw new Error(`no hunter ${id}`)
  return h
}

export function createHunter(
  db: Db,
  input: { id: string; name: string; timezone?: string; dailyResetHour?: number },
): Hunter {
  const now = Date.now()
  db.insert(hunters)
    .values({
      id: input.id,
      name: input.name,
      timezone: input.timezone ?? 'UTC',
      dailyResetHour: input.dailyResetHour ?? 4,
      rank: 'E', // awakening: everyone starts at the bottom rung, not below it
      allocated: {},
      excelia: {},
      createdAt: now,
      updatedAt: now,
    })
    .run()
  return requireHunter(db, input.id)
}

/**
 * Append to the ledger and roll the cache forward, atomically.
 *
 * The cache is advanced incrementally rather than by replaying the whole ledger
 * — `rebuildHunterCache` exists for when the full replay is what you want.
 */
export function appendEvent(db: Db, input: EventInput): Hunter {
  return db.transaction((tx) => appendEventIn(tx, input))
}

/** The body of `appendEvent`, for callers that already hold a transaction. */
export function appendEventIn(tx: Tx, input: EventInput): Hunter {
  const excelia = compactDelta(input.excelia ?? {})
  const allocated = compactDelta(input.allocated ?? {})
  const xp = input.xp ?? 0
  const gold = input.gold ?? 0

  {
    const h = tx.select().from(hunters).where(eq(hunters.id, input.hunterId)).get()
    if (!h) throw new Error(`no hunter ${input.hunterId}`)

    tx.insert(statEvents)
      .values({
        id: crypto.randomUUID(),
        hunterId: input.hunterId,
        at: input.at,
        source: input.source,
        sourceId: input.sourceId ?? null,
        xp,
        gold,
        excelia,
        allocated,
        note: input.note ?? null,
      })
      .run()

    const nextExcelia: Record<Stat, number> = { ...toBlock(h.excelia) }
    const nextAllocated: Record<Stat, number> = { ...toBlock(h.allocated) }
    let spentDelta = 0
    for (const s of STATS) {
      nextExcelia[s] += excelia[s] ?? 0
      const a = allocated[s] ?? 0
      nextAllocated[s] += a
      spentDelta += a
    }

    tx.update(hunters)
      .set({
        totalXp: h.totalXp + xp,
        gold: h.gold + gold,
        spentPoints: h.spentPoints + spentDelta,
        excelia: compactDelta(nextExcelia),
        allocated: compactDelta(nextAllocated),
        updatedAt: input.at,
      })
      .where(eq(hunters.id, input.hunterId))
      .run()

    const updated = tx.select().from(hunters).where(eq(hunters.id, input.hunterId)).get()
    if (!updated) throw new Error(`hunter ${input.hunterId} vanished mid-transaction`)
    return updated
  }
}

/** Replay the whole ledger and overwrite the cache. The escape hatch. */
export function rebuildHunterCache(db: Db, hunterId: string): Hunter {
  return db.transaction((tx) => {
    const rows = tx.select().from(statEvents).where(eq(statEvents.hunterId, hunterId)).all()
    const fold = foldEvents(rows)
    tx.update(hunters)
      .set({
        totalXp: fold.totalXp,
        gold: fold.gold,
        spentPoints: fold.spentPoints,
        excelia: compactDelta(fold.excelia),
        allocated: compactDelta(fold.allocated),
      })
      .where(eq(hunters.id, hunterId))
      .run()
    const updated = tx.select().from(hunters).where(eq(hunters.id, hunterId)).get()
    if (!updated) throw new Error(`no hunter ${hunterId}`)
    return updated
  })
}

/**
 * Record that the Awakening was completed.
 *
 * Separate from `updateSettings` on purpose: this is not a preference. It is
 * the gate every System route is guarded by, and it should be as hard to set
 * by accident from a settings form as `totalXp` is.
 */
export function markAwakened(db: Db, hunterId: string, at = Date.now()): Hunter {
  db.update(hunters).set({ onboardedAt: at, updatedAt: at }).where(eq(hunters.id, hunterId)).run()
  return requireHunter(db, hunterId)
}

/**
 * Send a hunter back to the Awakening.
 *
 * Touches nothing but the flag. The ledger, the quests, the levels and the
 * evidence all stay exactly where they are — replaying the ritual re-asks the
 * questions, it does not start a new life.
 */
export function clearAwakening(db: Db, hunterId: string): Hunter {
  db.update(hunters)
    .set({ onboardedAt: null, updatedAt: Date.now() })
    .where(eq(hunters.id, hunterId))
    .run()
  return requireHunter(db, hunterId)
}

/** The cached fold, in the shape the domain and UI expect. */
export function hunterState(hunter: Hunter): DerivedState {
  return deriveState({
    totalXp: hunter.totalXp,
    gold: hunter.gold,
    spentPoints: hunter.spentPoints,
    allocated: toBlock(hunter.allocated),
    excelia: toBlock(hunter.excelia),
  })
}

/** Recompute the fold straight from the ledger — used to assert the invariant. */
export function foldFromLedger(db: Db, hunterId: string) {
  const rows = db.select().from(statEvents).where(eq(statEvents.hunterId, hunterId)).all()
  return foldEvents(rows)
}

export function updateSettings(
  db: Db,
  hunterId: string,
  patch: Partial<
    Pick<
      Hunter,
      // Preferences only. Progression fields are absent on purpose: level, xp,
      // gold and stats are the ledger's to decide, never a settings form's.
      | 'name'
      | 'timezone'
      | 'dailyResetHour'
      | 'rotatingQuestCount'
      | 'difficulty'
      | 'theme'
      | 'background'
      | 'voiceAdapter'
      | 'voiceId'
      | 'voiceRate'
      | 'voicePitch'
      | 'voiceVolume'
      | 'voicePolicy'
      | 'aiProvider'
      | 'aiModel'
      | 'aiBaseUrl'
      | 'aiThinking'
      | 'aiReasoningTokens'
      | 'aiThinkingTimeoutMs'
      | 'aiMaxOutputTokens'
      | 'webllmModel'
    >
  >,
): Hunter {
  db.update(hunters)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(hunters.id, hunterId))
    .run()
  return requireHunter(db, hunterId)
}
