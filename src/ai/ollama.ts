/**
 * Native Ollama adapter.
 *
 * Ollama is reachable through its OpenAI-compatible `/v1` endpoint, and that is
 * what this file exists to avoid. Measured against a local `qwen3.5:4b`:
 *
 *   POST /v1/chat/completions, max_tokens 2000  ->  content: "", 2000 tokens
 *                                                   of hidden reasoning, 62s
 *   POST /api/chat, think: false                ->  the answer, immediately
 *
 * Every modern local model worth using is a thinking model, and `/v1` offers no
 * way to turn that off — `think`, `chat_template_kwargs.thinking`, and a larger
 * budget were all tried and all still returned empty content. Routing Ollama
 * through the compat layer would mean the reasoning guard fires on every single
 * call and the user never sees a generated line at all.
 *
 * So this talks to Ollama's own API, where thinking is actually controllable.
 *
 * Thinking is ON by default because the lines are better, but it needs real
 * headroom — the budget covers reasoning AND the answer, and a thinking model
 * given too little spends it all reasoning and returns nothing. Measured on
 * qwen3.5:4b for a two-sentence line:
 *
 *   think:false                      ->  2.4s, a good answer
 *   think:true, num_predict 1200     ->  62s, EMPTY (all of it reasoning)
 *   think:true, num_predict 3000     ->  36s, a good answer
 *
 * Worse, a local thinking model does not reliably stop: one measured attempt
 * ran 178 seconds and still produced only reasoning, while the non-thinking
 * retry answered in 6.6. So thinking attempts are given a deadline.
 *
 * Hence the ladder below: think, with headroom and a time limit; if that yields
 * nothing visible, retry without thinking rather than leave the System blank;
 * and the authored fallback catches everything after that. Whatever happens,
 * the hunter gets a complete System line.
 */

import { z } from 'zod'
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
import { RANKS } from '@/domain/types'

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

/** The config's base URL may point at `/v1`; the native API lives at the root. */
export function nativeBaseUrl(baseUrl: string | undefined): string {
  const raw = baseUrl?.trim() || 'http://localhost:11434'
  return raw.replace(/\/+$/, '').replace(/\/v1$/, '')
}

interface ChatLine {
  message?: { content?: string }
  done?: boolean
  error?: string
}

export class OllamaNarrator implements SystemNarrator {
  readonly id: string
  readonly #base: string
  readonly #config: AiConfig
  readonly #sink: AiCallSink
  readonly #fallback = new NullNarrator()
  readonly #fetch: typeof fetch

  constructor(config: AiConfig, sink: AiCallSink = () => {}, fetchImpl: typeof fetch = fetch) {
    this.#config = config
    this.#base = nativeBaseUrl(config.baseUrl)
    this.#sink = sink
    this.#fetch = fetchImpl
    this.id = `ollama:${config.model}`
  }

  #record(
    operation: string,
    started: number,
    extra: { ok: boolean; fellBack: boolean; error?: string; outputTokens?: number },
  ): void {
    this.#sink({
      at: Date.now(),
      provider: 'ollama',
      model: this.#config.model,
      operation,
      latencyMs: Date.now() - started,
      ...extra,
    })
  }

  async #post(body: unknown, signal?: AbortSignal): Promise<Response> {
    return this.#fetch(`${this.#base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  }

  /** Total generation budget: the answer, plus reasoning headroom when thinking. */
  #budget(thinking: boolean): number {
    return this.#config.maxOutputTokens + (thinking ? this.#config.reasoningTokens : 0)
  }

  async *#stream(
    operation: string,
    prompt: string,
    fallback: () => AsyncIterable<string>,
  ): AsyncIterable<string> {
    // Attempt with thinking (if configured), then without, then the fallback.
    const attempts = this.#config.thinking ? [true, false] : [false]

    for (const thinking of attempts) {
      const text = await this.#attempt(operation, prompt, thinking)
      if (text !== null) {
        yield text
        return
      }
    }
    yield* fallback()
  }

  /** One request. Returns null when it produced nothing usable. */
  async #attempt(operation: string, prompt: string, thinking: boolean): Promise<string | null> {
    const started = Date.now()
    const chunks: string[] = []

    // Only a thinking attempt gets a deadline; a plain one is already fast.
    const controller = new AbortController()
    const deadline = thinking
      ? setTimeout(() => controller.abort(), this.#config.thinkingTimeoutMs)
      : null

    try {
      const response = await this.#post({
        model: this.#config.model,
        stream: true,
        think: thinking,
        options: { num_predict: this.#budget(thinking) },
        messages: [
          { role: 'system', content: SYSTEM_VOICE },
          { role: 'user', content: prompt },
        ],
      }, controller.signal)

      if (!response.ok || !response.body) {
        throw new Error(`ollama responded ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Ollama streams newline-delimited JSON, one object per token batch.
        let newline: number
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          if (!line) continue
          let parsed: ChatLine
          try {
            parsed = JSON.parse(line) as ChatLine
          } catch {
            continue
          }
          if (parsed.error) throw new Error(parsed.error)
          const piece = parsed.message?.content
          if (piece) chunks.push(piece)
        }
      }

      const text = chunks.join('')
      if (text.trim().length === 0) {
        // The budget went entirely on hidden reasoning.
        this.#record(operation, started, {
          ok: true,
          fellBack: true,
          error: `empty visible output (thinking=${thinking})`,
        })
        return null
      }

      this.#record(operation, started, { ok: true, fellBack: false })
      return text
    } catch (err) {
      const aborted = controller.signal.aborted
      this.#record(operation, started, {
        ok: false,
        fellBack: true,
        error: aborted
          ? `thinking exceeded ${this.#config.thinkingTimeoutMs}ms`
          : err instanceof Error
            ? err.message
            : String(err),
      })
      return null
    } finally {
      if (deadline !== null) clearTimeout(deadline)
    }
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
    const started = Date.now()

    // A schema-constrained call from a thinking model can hang the same way a
    // narration can, so it gets the same deadline.
    const controller = new AbortController()
    const deadline = this.#config.thinking
      ? setTimeout(() => controller.abort(), this.#config.thinkingTimeoutMs)
      : null

    try {
      const response = await this.#post({
        model: this.#config.model,
        stream: false,
        // A schema-constrained answer is short; reasoning still needs headroom.
        think: this.#config.thinking,
        // Ollama constrains generation to the supplied JSON schema.
        format: z.toJSONSchema(schema),
        options: { num_predict: this.#budget(this.#config.thinking) },
        messages: [
          { role: 'system', content: SYSTEM_VOICE },
          { role: 'user', content: prompt },
        ],
      }, controller.signal)
      if (!response.ok) throw new Error(`ollama responded ${response.status}`)

      const body = (await response.json()) as ChatLine
      const parsed = schema.safeParse(JSON.parse(body.message?.content ?? ''))
      if (!parsed.success) throw new Error('response did not match the schema')

      this.#record(operation, started, { ok: true, fellBack: false })
      return parsed.data
    } catch (err) {
      const aborted = controller.signal.aborted
      this.#record(operation, started, {
        ok: false,
        fellBack: true,
        error: aborted
          ? `thinking exceeded ${this.#config.thinkingTimeoutMs}ms`
          : err instanceof Error
            ? err.message
            : String(err),
      })
      return null
    } finally {
      if (deadline !== null) clearTimeout(deadline)
    }
  }

  async weeklyScenario(history: HunterHistory): Promise<Scenario> {
    const out = await this.#object('weeklyScenario', scenarioPrompt(history), scenarioSchema)
    return out ?? this.#fallback.weeklyScenario(history)
  }

  async judgeFeat(feat: Feat, history: HunterHistory): Promise<FeatVerdict> {
    const out = await this.#object('judgeFeat', judgePrompt(feat, history), verdictSchema)
    return out ?? this.#fallback.judgeFeat(feat, history)
  }
}
