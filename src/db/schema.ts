/**
 * SQLite schema.
 *
 * Two decisions shape everything here:
 *
 * 1. `hunter` has a primary key from day one. There is exactly one row today,
 *    but every other table carries `hunter_id`, so opening the System to other
 *    people later is a migration rather than a rewrite.
 *
 * 2. `stat_events` is an append-only ledger and the actual source of truth.
 *    The counters on `hunter` are a cached fold over it. Nothing subtracts from
 *    the ledger; a correction is another row. That means a balance change can
 *    be replayed over real history, and the Status window can show where every
 *    single point came from instead of a number that appeared from nowhere.
 */

import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type {
  Difficulty,
  DungeonOutcome,
  PenaltyStatus,
  QuestStatus,
  Rank,
  Stat,
  Tier,
  Track,
} from '@/domain/types'

/** Sparse per-stat deltas, stored as JSON because most events touch one stat. */
type StatDelta = Partial<Record<Stat, number>>

const now = sql`(unixepoch() * 1000)`

export const hunters = sqliteTable('hunters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),

  // Settings
  timezone: text('timezone').notNull().default('UTC'),
  dailyResetHour: integer('daily_reset_hour').notNull().default(4),
  rotatingQuestCount: integer('rotating_quest_count').notNull().default(2),
  difficulty: text('difficulty').$type<Difficulty>().notNull().default('NORMAL'),
  theme: text('theme').notNull().default('hologram'),
  /** Which animated background runs behind the System. 'none' is the still one. */
  background: text('background').notNull().default('none'),

  // Voice settings — see src/voice
  voiceAdapter: text('voice_adapter').notNull().default('webspeech'),
  voiceId: text('voice_id'),
  voiceRate: integer('voice_rate').notNull().default(100), // percent
  voicePitch: integer('voice_pitch').notNull().default(100), // percent
  voiceVolume: integer('voice_volume').notNull().default(100), // percent
  voicePolicy: text('voice_policy').notNull().default('EVENTS'), // ALWAYS | EVENTS | MANUAL

  /*
   * Model settings live here so they can be changed from Settings rather than
   * by editing a file and restarting. API KEYS DELIBERATELY DO NOT: a key in
   * this table would be read into a server component and could end up in
   * rendered HTML or a cached payload. Keys stay in AI_API_KEY.
   */
  aiProvider: text('ai_provider'),
  aiModel: text('ai_model'),
  aiBaseUrl: text('ai_base_url'),
  aiThinking: integer('ai_thinking', { mode: 'boolean' }),
  aiReasoningTokens: integer('ai_reasoning_tokens'),
  aiThinkingTimeoutMs: integer('ai_thinking_timeout_ms'),
  aiMaxOutputTokens: integer('ai_max_output_tokens'),
  /** Model id for the in-browser engine, e.g. Llama-3.2-3B-Instruct-q4f16_1-MLC. */
  webllmModel: text('webllm_model'),

  // Progression. Rank never moves on grind alone — only judged feats (Phase 3).
  rank: text('rank').$type<Rank>().notNull().default('UNRANKED'),

  // ---- cached fold over stat_events; rebuildable at any time ----
  totalXp: integer('total_xp').notNull().default(0),
  gold: integer('gold').notNull().default(0),
  spentPoints: integer('spent_points').notNull().default(0),
  allocated: text('allocated', { mode: 'json' }).$type<StatDelta>().notNull().default({}),
  excelia: text('excelia', { mode: 'json' }).$type<StatDelta>().notNull().default({}),

  /*
   * When the Awakening was completed. Null means it has not happened yet, and
   * every System route redirects to it — which is the whole gate. It is a
   * timestamp rather than a boolean because "when did this person start" is
   * worth keeping, and because clearing it is how Settings replays the ritual.
   */
  onboardedAt: integer('onboarded_at'),

  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
})

export type EventSource =
  | 'QUEST'
  | 'FULL_CLEAR'
  | 'DUNGEON'
  | 'LOOT'
  | 'ALLOCATION'
  | 'PENALTY_RESOLVED'
  | 'ADJUSTMENT'

export const statEvents = sqliteTable(
  'stat_events',
  {
    id: text('id').primaryKey(),
    hunterId: text('hunter_id')
      .notNull()
      .references(() => hunters.id, { onDelete: 'cascade' }),
    at: integer('at').notNull(),
    source: text('source').$type<EventSource>().notNull(),
    /** Row id of whatever caused this — a quest, a dungeon run, a loot drop. */
    sourceId: text('source_id'),
    xp: integer('xp').notNull().default(0),
    gold: integer('gold').notNull().default(0),
    /** Excelia earned through deeds. */
    excelia: text('excelia', { mode: 'json' }).$type<StatDelta>().notNull().default({}),
    /** Level-up points placed by hand. */
    allocated: text('allocated', { mode: 'json' }).$type<StatDelta>().notNull().default({}),
    note: text('note'),
  },
  (t) => [index('stat_events_hunter_at').on(t.hunterId, t.at)],
)

export const questTemplates = sqliteTable(
  'quest_templates',
  {
    id: text('id').primaryKey(),
    hunterId: text('hunter_id')
      .notNull()
      .references(() => hunters.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    track: text('track').$type<Track>().notNull(),
    tier: integer('tier').$type<Tier>().notNull().default(2),
    statRewards: text('stat_rewards', { mode: 'json' }).$type<StatDelta>().notNull().default({}),
    baseXp: integer('base_xp').notNull(),
    baseGold: integer('base_gold').notNull().default(0),
    /** Core dailies are always issued; the rest rotate. */
    isCore: integer('is_core', { mode: 'boolean' }).notNull().default(false),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('quest_templates_hunter').on(t.hunterId, t.enabled)],
)

export const quests = sqliteTable(
  'quests',
  {
    id: text('id').primaryKey(),
    hunterId: text('hunter_id')
      .notNull()
      .references(() => hunters.id, { onDelete: 'cascade' }),
    templateId: text('template_id')
      .notNull()
      .references(() => questTemplates.id, { onDelete: 'cascade' }),
    /** System day this quest belongs to, e.g. `2026-01-15`. */
    dayKey: text('day_key').notNull(),
    issuedAt: integer('issued_at').notNull(),
    dueAt: integer('due_at').notNull(),
    status: text('status').$type<QuestStatus>().notNull().default('ISSUED'),
    completedAt: integer('completed_at'),
    evidenceId: text('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),
    /** Reward actually paid, after decay and debuff. Kept for the record. */
    awardedXp: integer('awarded_xp').notNull().default(0),
    /** Repetition multiplier at the moment of issue, x1000. Shown in the UI. */
    multiplierMilli: integer('multiplier_milli').notNull().default(1000),
  },
  (t) => [
    uniqueIndex('quests_one_per_template_per_day').on(t.hunterId, t.templateId, t.dayKey),
    index('quests_hunter_status_due').on(t.hunterId, t.status, t.dueAt),
  ],
)

export const penalties = sqliteTable(
  'penalties',
  {
    id: text('id').primaryKey(),
    hunterId: text('hunter_id')
      .notNull()
      .references(() => hunters.id, { onDelete: 'cascade' }),
    sourceQuestId: text('source_quest_id')
      .notNull()
      .references(() => quests.id, { onDelete: 'cascade' }),
    issuedAt: integer('issued_at').notNull(),
    dueAt: integer('due_at').notNull(),
    requirement: text('requirement').notNull(),
    status: text('status').$type<PenaltyStatus>().notNull().default('ACTIVE'),
    resolvedAt: integer('resolved_at'),
    /** Atonement is not taken on trust. */
    evidenceId: text('evidence_id').references(() => evidence.id, { onDelete: 'set null' }),
    escalation: integer('escalation').notNull().default(0),
  },
  (t) => [index('penalties_hunter_status').on(t.hunterId, t.status)],
)

export const dungeonRuns = sqliteTable(
  'dungeon_runs',
  {
    id: text('id').primaryKey(),
    hunterId: text('hunter_id')
      .notNull()
      .references(() => hunters.id, { onDelete: 'cascade' }),
    objective: text('objective').notNull(),
    track: text('track').$type<Track>().notNull(),
    /** Authoritative. Elapsed time is derived from this and the server clock. */
    startedAt: integer('started_at').notNull(),
    plannedMs: integer('planned_ms').notNull(),
    endedAt: integer('ended_at'),
    outcome: text('outcome').$type<DungeonOutcome>(),
    awardedXp: integer('awarded_xp').notNull().default(0),
  },
  (t) => [index('dungeon_runs_hunter_started').on(t.hunterId, t.startedAt)],
)

export const evidence = sqliteTable('evidence', {
  id: text('id').primaryKey(),
  hunterId: text('hunter_id')
    .notNull()
    .references(() => hunters.id, { onDelete: 'cascade' }),
  kind: text('kind').$type<'PHOTO' | 'SCREENSHOT' | 'LINK' | 'NOTE'>().notNull(),
  /** Path under data/evidence for files; null for links and notes. */
  path: text('path'),
  url: text('url'),
  note: text('note'),
  sha256: text('sha256'),
  bytes: integer('bytes'),
  createdAt: integer('created_at').notNull().default(now),
})

export const inventory = sqliteTable(
  'inventory',
  {
    id: text('id').primaryKey(),
    hunterId: text('hunter_id')
      .notNull()
      .references(() => hunters.id, { onDelete: 'cascade' }),
    lootId: text('loot_id').notNull(),
    acquiredAt: integer('acquired_at').notNull(),
    /** Where it dropped, for the record. */
    sourceId: text('source_id'),
    consumedAt: integer('consumed_at'),
  },
  (t) => [index('inventory_hunter_unconsumed').on(t.hunterId, t.consumedAt)],
)

/** Everything the System has said, so the feed is replayable and auditable. */
export const systemLog = sqliteTable(
  'system_log',
  {
    id: text('id').primaryKey(),
    hunterId: text('hunter_id')
      .notNull()
      .references(() => hunters.id, { onDelete: 'cascade' }),
    at: integer('at').notNull(),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    /** True when an AI wrote this line rather than the authored fallback. */
    generated: integer('generated', { mode: 'boolean' }).notNull().default(false),
    spoken: integer('spoken', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('system_log_hunter_at').on(t.hunterId, t.at)],
)

/** The AI layer is never a black box: every call is on the record. */
export const aiCalls = sqliteTable(
  'ai_calls',
  {
    id: text('id').primaryKey(),
    at: integer('at').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    ok: integer('ok', { mode: 'boolean' }).notNull().default(true),
    /** Set when the call produced nothing usable and the fallback took over. */
    fellBack: integer('fell_back', { mode: 'boolean' }).notNull().default(false),
    error: text('error'),
  },
  (t) => [index('ai_calls_at').on(t.at)],
)

/** Local text only. Audio never enters the database. */
export const assistantPreferences = sqliteTable('assistant_preferences', {
  hunterId: text('hunter_id').primaryKey().references(() => hunters.id, { onDelete: 'cascade' }),
  value: text('value', { mode: 'json' }).$type<import('@/assistant/schema').AssistantPreferences>().notNull(),
})
export const assistantMessages = sqliteTable('assistant_messages', {
  id: text('id').primaryKey(), hunterId: text('hunter_id').notNull().references(() => hunters.id, { onDelete: 'cascade' }),
  role: text('role').$type<'user' | 'assistant'>().notNull(), text: text('text').notNull(), at: integer('at').notNull(),
}, t => [index('assistant_messages_hunter_at').on(t.hunterId, t.at)])
export const assistantExecutions = sqliteTable('assistant_executions', {
  id: text('id').primaryKey(), hunterId: text('hunter_id').notNull().references(() => hunters.id, { onDelete: 'cascade' }),
  fingerprint: text('fingerprint').notNull(), result: text('result', { mode: 'json' }).$type<import('@/assistant/types').BatchResult>().notNull(),
  nextIndex: integer('next_index').notNull().default(0), at: integer('at').notNull(), expiresAt: integer('expires_at'),
})
