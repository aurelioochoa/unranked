/**
 * Model-backed narrator.
 *
 * Two things matter more here than the prompting:
 *
 * 1. Every path falls back to the authored NullNarrator. A model that errors,
 *    times out, or returns nothing must never produce a blank System panel.
 *
 * 2. The reasoning-model guard. Local reasoning models — deepseek-r1, qwen and
 *    friends behind Ollama — routinely spend their entire token budget on
 *    hidden reasoning and return empty visible content. Short outputs like
 *    these are exactly the shape that triggers it. Without the retry below,
 *    Ollama support looks broken at random, and the bug looks like ours.
 */

import { generateObject, streamText, type LanguageModel } from 'ai'
import { z } from 'zod'
import { RANKS } from '@/domain/types'
import type { AiConfig } from './config'
import { NullNarrator } from './null'
import {
  dungeonPrompt,
  judgePrompt,
  levelUpPrompt,
  penaltyPrompt,
  questIssuePrompt,
  scenarioPrompt,
  SYSTEM_VOICE,
} from './prompts'
import type {
  AiCallSink,
  DungeonContext,
  Feat,
  FeatVerdict,
  HunterHistory,
  LevelUpContext,
  PenaltyContext,
  QuestContext,
  Scenario,
  SystemNarrator,
} from './types'

/** Appended on the retry: tell the model to stop thinking and start answering. */
const ANSWER_NOW =
  '\n\nRespond with the final text immediately. Do not deliberate, plan, or explain your reasoning.'

const scenarioSchema = z.object({
  title: z.string().min(1),
  narration: z.string().min(1),
  clearCondition: z.string().min(1),
  failurePenalty: z.string().min(1),
})

const verdictSchema = z.object({
  accepted: z.boolean(),
  reasoning: z.string().min(1),
  rankAwarded: z.enum(RANKS).nullable(),
})

export class LlmNarrator implements SystemNarrator {
  readonly id: string
  readonly #model: LanguageModel
  readonly #config: AiConfig
  readonly #sink: AiCallSink
  readonly #fallback = new NullNarrator()

  constructor(model: LanguageModel, config: AiConfig, sink: AiCallSink = () => {}) {
    this.#model = model
    this.#config = config
    this.#sink = sink
    this.id = `${config.provider}:${config.model}`
  }

  #record(
    operation: string,
    started: number,
    extra: { ok: boolean; fellBack: boolean; error?: string; inputTokens?: number; outputTokens?: number },
  ): void {
    this.#sink({
      at: Date.now(),
      provider: this.#config.provider,
      model: this.#config.model,
      operation,
      latencyMs: Date.now() - started,
      ...extra,
    })
  }

  /**
   * Stream one narration, guarding against the empty-visible-output failure.
   *
   * Nothing is yielded until we know the attempt produced text, so a blank
   * first attempt can be retried without the user seeing a false start.
   */
  async *#stream(
    operation: string,
    prompt: string,
    fallback: () => AsyncIterable<string>,
  ): AsyncIterable<string> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now()
      const retrying = attempt > 0
      const chunks: string[] = []

      // streamText routes provider failures to onError rather than throwing out
      // of textStream. Without capturing it here, a refused connection would be
      // logged as "empty visible output" and misdiagnosed as a reasoning model.
      let streamError: unknown

      try {
        const result = streamText({
          model: this.#model,
          system: SYSTEM_VOICE,
          prompt: retrying ? prompt + ANSWER_NOW : prompt,
          // A reasoning model needs far more headroom than the visible answer
          // implies, because the hidden reasoning is billed against this too.
          maxOutputTokens: this.#config.maxOutputTokens * (retrying ? 6 : 1),
          onError: ({ error }) => {
            streamError = error
          },
        })

        for await (const chunk of result.textStream) chunks.push(chunk)

        const text = chunks.join('')
        const usage = await Promise.resolve(result.usage).catch(() => undefined)

        if (text.trim().length > 0) {
          this.#record(operation, started, {
            ok: true,
            fellBack: false,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          })
          yield text
          return
        }

        if (streamError !== undefined) {
          this.#record(operation, started, {
            ok: false,
            fellBack: retrying,
            error: streamError instanceof Error ? streamError.message : String(streamError),
          })
          if (retrying) break
          continue
        }

        // Empty visible output with no error. Almost always a reasoning model
        // that spent the whole budget thinking. Retry with room to breathe.
        this.#record(operation, started, {
          ok: true,
          fellBack: retrying,
          error: 'empty visible output',
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
        })
      } catch (err) {
        this.#record(operation, started, {
          ok: false,
          fellBack: retrying,
          error: err instanceof Error ? err.message : String(err),
        })
        if (retrying) break
      }
    }

    yield* fallback()
  }

  narrateQuestIssue(ctx: QuestContext): AsyncIterable<string> {
    return this.#stream('narrateQuestIssue', questIssuePrompt(ctx), () =>
      this.#fallback.narrateQuestIssue(ctx),
    )
  }

  narratePenalty(ctx: PenaltyContext): AsyncIterable<string> {
    return this.#stream('narratePenalty', penaltyPrompt(ctx), () =>
      this.#fallback.narratePenalty(ctx),
    )
  }

  narrateLevelUp(ctx: LevelUpContext): AsyncIterable<string> {
    return this.#stream('narrateLevelUp', levelUpPrompt(ctx), () =>
      this.#fallback.narrateLevelUp(ctx),
    )
  }

  narrateDungeon(ctx: DungeonContext): AsyncIterable<string> {
    return this.#stream('narrateDungeon', dungeonPrompt(ctx), () =>
      this.#fallback.narrateDungeon(ctx),
    )
  }

  async #object<T>(operation: string, prompt: string, schema: z.ZodType<T>): Promise<T | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const started = Date.now()
      const retrying = attempt > 0
      try {
        const result = await generateObject({
          model: this.#model,
          schema,
          system: SYSTEM_VOICE,
          prompt: retrying ? prompt + ANSWER_NOW : prompt,
          maxOutputTokens: this.#config.maxOutputTokens * (retrying ? 6 : 2),
        })
        this.#record(operation, started, {
          ok: true,
          fellBack: false,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
        })
        return result.object
      } catch (err) {
        this.#record(operation, started, {
          ok: false,
          fellBack: retrying,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return null
  }

  async weeklyScenario(history: HunterHistory): Promise<Scenario> {
    const out = await this.#object('weeklyScenario', scenarioPrompt(history), scenarioSchema)
    return out ?? this.#fallback.weeklyScenario(history)
  }

  async judgeFeat(feat: Feat, history: HunterHistory): Promise<FeatVerdict> {
    const out = await this.#object('judgeFeat', judgePrompt(feat, history), verdictSchema)
    // A failed judgment must never become an accidental promotion.
    return out ?? this.#fallback.judgeFeat(feat, history)
  }
}
