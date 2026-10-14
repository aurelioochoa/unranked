/**
 * The one interface the rest of the app knows about.
 *
 * Narration streams. That is not a nicety: it is what lets the voice layer
 * start speaking a sentence while the model is still writing the next one.
 * Retrofitting streaming later would mean rewriting every call site.
 */

import type { Rank, Track } from '@/domain/types'

export interface QuestLine {
  readonly title: string
  /** Repetition multiplier, 1.0 = full value. Below 1 means it is going stale. */
  readonly multiplier: number
}

export interface QuestContext {
  readonly hunterName: string
  readonly level: number
  readonly rank: Rank
  readonly dayKey: string
  readonly quests: readonly QuestLine[]
  /** Current reward multiplier from outstanding penalties. 1 = clean. */
  readonly debuff: number
  readonly activePenalties: number
}

export interface PenaltyContext {
  readonly hunterName: string
  readonly missedTitles: readonly string[]
  readonly requirement: string
  readonly escalation: number
  readonly deadlineInHours: number
}

export interface LevelUpContext {
  readonly hunterName: string
  readonly level: number
  readonly pointsGranted: number
}

export interface DungeonContext {
  readonly objective: string
  readonly track: Track
  readonly minutes: number
  readonly outcome: 'CLEARED' | 'FLED' | 'EXPIRED'
  readonly xp: number
  readonly loot: readonly string[]
}

export interface HunterHistory {
  readonly hunterName: string
  readonly level: number
  readonly rank: Rank
  readonly daysActive: number
  readonly completionRate: number
  readonly stalestQuests: readonly string[]
  readonly strongestTrack: Track
  readonly weakestTrack: Track
}

export interface Scenario {
  readonly title: string
  readonly narration: string
  readonly clearCondition: string
  readonly failurePenalty: string
}

export interface Feat {
  readonly title: string
  readonly narrative: string
  readonly evidenceKind: string
}

export interface FeatVerdict {
  readonly accepted: boolean
  readonly reasoning: string
  readonly rankAwarded: Rank | null
}

export interface SystemNarrator {
  /** Identifies the backing provider, for the settings screen and the log. */
  readonly id: string
  narrateQuestIssue(ctx: QuestContext): AsyncIterable<string>
  narratePenalty(ctx: PenaltyContext): AsyncIterable<string>
  narrateLevelUp(ctx: LevelUpContext): AsyncIterable<string>
  narrateDungeon(ctx: DungeonContext): AsyncIterable<string>
  weeklyScenario(history: HunterHistory): Promise<Scenario>
  /** Phase 3. Declared now so adding it later touches no adapter. */
  judgeFeat(feat: Feat, history: HunterHistory): Promise<FeatVerdict>
}

/** Recorded for every model call, so the AI layer is never a black box. */
export interface AiCallRecord {
  readonly at: number
  readonly provider: string
  readonly model: string
  readonly operation: string
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly latencyMs?: number
  readonly ok: boolean
  /** True when the model produced nothing usable and the fallback took over. */
  readonly fellBack: boolean
  readonly error?: string
}

export type AiCallSink = (record: AiCallRecord) => void
