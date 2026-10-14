/**
 * Core domain vocabulary. Pure data — no I/O, no framework types.
 */

/** The six stats. Canon five from Solo Leveling, plus CRA for work and economics. */
export const STATS = ['STR', 'VIT', 'AGI', 'INT', 'PER', 'CRA'] as const
export type Stat = (typeof STATS)[number]
export type StatBlock = Readonly<Record<Stat, number>>

export const ZERO_STATS: StatBlock = Object.freeze({
  STR: 0,
  VIT: 0,
  AGI: 0,
  INT: 0,
  PER: 0,
  CRA: 0,
})

export const STAT_NAMES: Readonly<Record<Stat, string>> = Object.freeze({
  STR: 'Strength',
  VIT: 'Vitality',
  AGI: 'Agility',
  INT: 'Intelligence',
  PER: 'Perception',
  CRA: 'Craft',
})

/** Life domains the System issues quests from. Each feeds one or more stats. */
export const TRACKS = ['BODY', 'MIND', 'DISCIPLINE', 'INNER', 'WORK'] as const
export type Track = (typeof TRACKS)[number]

export const TRACK_NAMES: Readonly<Record<Track, string>> = Object.freeze({
  BODY: 'Body',
  MIND: 'Mind',
  DISCIPLINE: 'Discipline',
  INNER: 'Inner',
  WORK: 'Work',
})

/**
 * Hunter rank. Advances only through judged feats (Phase 3) — never through grind.
 * Phase 1 awakens you at E and leaves you there.
 */
export const RANKS = ['UNRANKED', 'E', 'D', 'C', 'B', 'A', 'S'] as const
export type Rank = (typeof RANKS)[number]

/** How hard the System is willing to be. Scales penalty severity only. */
export const DIFFICULTIES = ['NORMAL', 'HARD', 'MONARCH'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export type QuestStatus = 'ISSUED' | 'COMPLETE' | 'FAILED'
export type PenaltyStatus = 'ACTIVE' | 'RESOLVED' | 'EXPIRED'
export type DungeonOutcome = 'CLEARED' | 'FLED' | 'EXPIRED'
export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'

/** Quest difficulty tier. Drives base XP and how far a penalty escalates. */
export const TIERS = [1, 2, 3, 4, 5] as const
export type Tier = (typeof TIERS)[number]

export interface QuestTemplate {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly track: Track
  readonly tier: Tier
  /** Stat points awarded on completion, before multipliers. */
  readonly statRewards: Partial<Record<Stat, number>>
  readonly baseXp: number
  readonly baseGold: number
  /** Core dailies are always issued. Non-core templates rotate. */
  readonly isCore: boolean
  readonly enabled: boolean
}

export interface Quest {
  readonly id: string
  readonly templateId: string
  readonly issuedAt: number
  readonly dueAt: number
  readonly status: QuestStatus
  readonly completedAt: number | null
}

export interface Penalty {
  readonly id: string
  /** The quest whose failure caused this. */
  readonly sourceQuestId: string
  readonly issuedAt: number
  readonly dueAt: number
  readonly requirement: string
  readonly status: PenaltyStatus
  readonly resolvedAt: number | null
  /** How many times this penalty has been allowed to lapse. Deepens the debuff. */
  readonly escalation: number
}

export interface DungeonRun {
  readonly id: string
  readonly objective: string
  readonly track: Track
  readonly startedAt: number
  readonly plannedMs: number
  readonly endedAt: number | null
  readonly outcome: DungeonOutcome | null
}

export interface Reward {
  readonly xp: number
  readonly gold: number
  readonly stats: Partial<Record<Stat, number>>
}

export const NO_REWARD: Reward = Object.freeze({ xp: 0, gold: 0, stats: {} })

/** Which stats a track's deeds feed. Keeps tracks meaningful. */
export const TRACK_STATS: Readonly<Record<Track, readonly Stat[]>> = Object.freeze({
  BODY: ['STR', 'VIT'],
  MIND: ['INT'],
  DISCIPLINE: ['AGI'],
  INNER: ['PER'],
  WORK: ['CRA'],
})
