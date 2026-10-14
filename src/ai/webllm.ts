'use client'

/**
 * The System, running in your own browser.
 *
 * WebLLM compiles a quantised model to WebGPU and serves an OpenAI-compatible
 * API entirely client-side: no server, no API key, no request leaving the
 * machine, and it works offline once the weights are cached. That makes it the
 * only provider here with no privacy question to answer at all.
 *
 * It is also the only provider the server cannot run, so this narrator lives on
 * the client and the page generates locally instead of calling /api/narrate.
 * The prompts are shared with every other provider — `src/ai/prompts.ts` is
 * pure, which is what makes that possible.
 *
 * The first use of a model downloads it (hundreds of megabytes to a few GB).
 * That is a foreground, visible cost, so loading is explicit and reports
 * progress rather than happening silently behind a spinner.
 */

import { NullNarrator } from './null'
import {
  dungeonPrompt,
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

export interface WebLlmProgress {
  /** 0..1 */
  readonly progress: number
  readonly text: string
}

type Engine = {
  unload(): Promise<void>
  interruptGenerate(): Promise<void>
  chat: {
    completions: {
      create(args: {
        messages: { role: string; content: string }[]
        stream?: boolean
        temperature?: number
        max_tokens?: number
        response_format?: { type: string }
      }): Promise<AsyncIterable<{ choices: { delta?: { content?: string } }[] }>>
    }
  }
}

/** WebGPU is required; without it this provider cannot run at all. */
export function webGpuAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

let enginePromise: Promise<Engine> | null = null
let loadedModel: string | null = null
let generationTail = Promise.resolve()
async function acquireGeneration(): Promise<() => void> {
  const previous = generationTail
  let release!: () => void
  generationTail = new Promise(resolve => { release = resolve })
  await previous
  return release
}
export async function webLlmContextWindow(modelId: string): Promise<number> {
  const webllm = await import('@mlc-ai/web-llm')
  const record = webllm.prebuiltAppConfig.model_list.find(model => model.model_id === modelId)
  return record?.overrides?.context_window_size ?? 4096
}


/**
 * Load (or reuse) the engine for a model.
 *
 * Cached at module scope: compiling a model takes tens of seconds and tens of
 * megabytes of GPU memory, so every page that wants the System must share one
 * engine rather than each building its own.
 */
export async function loadEngine(
  modelId: string,
  onProgress?: (p: WebLlmProgress) => void,
): Promise<Engine> {
  if (!webGpuAvailable()) {
    throw new Error('this browser has no WebGPU, so the in-browser model cannot run')
  }

  if (enginePromise && loadedModel === modelId) return enginePromise

  const previous = enginePromise
  loadedModel = modelId
  enginePromise = (async () => {
    if (previous) { try { await (await previous).unload() } catch { /* Failed loads have no live engine. */ } }
    const webllm = await import('@mlc-ai/web-llm')
    return (await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) =>
        onProgress?.({ progress: report.progress, text: report.text }),
    })) as unknown as Engine
  })()

  try {
    return await enginePromise
  } catch (err) {
    // A failed load must not poison every later attempt.
    enginePromise = null
    loadedModel = null
    throw err
  }
}

/** Has this model already been downloaded into the browser's cache? */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const webllm = await import('@mlc-ai/web-llm')
    return await webllm.hasModelInCache(modelId)
  } catch {
    return false
  }
}

export interface WebLlmModelOption {
  readonly id: string
  /** Approximate VRAM required, in MB, when the catalogue reports it. */
  readonly vramMb?: number
  readonly lowResource: boolean
}

/** The catalogue of models this build of WebLLM can run. */
export async function listWebLlmModels(): Promise<WebLlmModelOption[]> {
  try {
    const webllm = await import('@mlc-ai/web-llm')
    return webllm.prebuiltAppConfig.model_list.map((m) => ({
      id: m.model_id,
      vramMb: m.vram_required_MB,
      lowResource: m.low_resource_required === true,
    }))
  } catch {
    return []
  }
}

export class WebLlmNarrator implements SystemNarrator {
  readonly id: string
  readonly #model: string
  readonly #sink: AiCallSink
  readonly #fallback = new NullNarrator()
  readonly #onProgress?: (p: WebLlmProgress) => void
  readonly #maxTokens: number

  constructor(
    modelId: string,
    opts: {
      sink?: AiCallSink
      onProgress?: (p: WebLlmProgress) => void
      maxOutputTokens?: number
    } = {},
  ) {
    this.#model = modelId
    this.id = `webllm:${modelId}`
    this.#sink = opts.sink ?? (() => {})
    this.#onProgress = opts.onProgress
    this.#maxTokens = opts.maxOutputTokens ?? 400
  }

  #record(operation: string, started: number, ok: boolean, fellBack: boolean, error?: string): void {
    this.#sink({
      at: Date.now(),
      provider: 'webllm',
      model: this.#model,
      operation,
      latencyMs: Date.now() - started,
      ok,
      fellBack,
      error,
    })
  }

  async *#stream(
    operation: string,
    prompt: string,
    fallback: () => AsyncIterable<string>,
  ): AsyncIterable<string> {
    const started = Date.now()
    let produced = ''
    const release = await acquireGeneration()

    try {
      const engine = await loadEngine(this.#model, this.#onProgress)
      const completion = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_VOICE },
          { role: 'user', content: prompt },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: this.#maxTokens,
      })

      for await (const part of completion) {
        const piece = part.choices[0]?.delta?.content
        if (!piece) continue
        produced += piece
        yield piece
      }

      if (produced.trim().length === 0) {
        this.#record(operation, started, true, true, 'empty visible output')
        yield* fallback()
        return
      }
      this.#record(operation, started, true, false)
    } catch (err) {
      this.#record(operation, started, false, true, err instanceof Error ? err.message : String(err))
      // Only fall back if nothing was shown; otherwise the line is already
      // half-spoken and appending the authored version would read as a stutter.
      if (produced.trim().length === 0) yield* fallback()
    } finally { release() }
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

  async weeklyScenario(history: HunterHistory): Promise<Scenario> {
    const started = Date.now()
    const release = await acquireGeneration()
    try {
      const engine = await loadEngine(this.#model, this.#onProgress)
      const completion = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: SYSTEM_VOICE },
          {
            role: 'user',
            content: `${scenarioPrompt(history)}\n\nReply with JSON only: {"title","narration","clearCondition","failurePenalty"}.`,
          },
        ],
        stream: true,
        response_format: { type: 'json_object' },
        max_tokens: this.#maxTokens * 2,
      })

      let raw = ''
      for await (const part of completion) raw += part.choices[0]?.delta?.content ?? ''

      const parsed = JSON.parse(raw) as Partial<Scenario>
      if (!parsed.title || !parsed.narration || !parsed.clearCondition || !parsed.failurePenalty) {
        throw new Error('incomplete scenario')
      }
      this.#record('weeklyScenario', started, true, false)
      return parsed as Scenario
    } catch (err) {
      this.#record('weeklyScenario', started, false, true, err instanceof Error ? err.message : String(err))
      return this.#fallback.weeklyScenario(history)
    } finally { release() }
  }

  async judgeFeat(feat: Feat, history: HunterHistory): Promise<FeatVerdict> {
    // Phase 3. A 3B model judging whether you earned a rank is not a judgment
    // worth trusting, so this defers rather than rubber-stamping one.
    return this.#fallback.judgeFeat(feat, history)
  }
}

/** Conversation shares the already downloaded engine with narration. */
export async function* streamWebLlmConversation(modelId: string, messages: { role: string; content: string }[], signal: AbortSignal): AsyncIterable<string> {
  if (!(await isModelCached(modelId))) throw new Error('Download the WebLLM model in assistant settings first.')
  const release = await acquireGeneration()
  let engine: Engine | null = null
  const stop = () => { void engine?.interruptGenerate() }
  signal.addEventListener('abort', stop, { once: true })
  try {
    signal.throwIfAborted()
    engine = await loadEngine(modelId)
    signal.throwIfAborted()
    const completion = await engine.chat.completions.create({ messages, stream: true, max_tokens: Math.min(700, Math.floor((await webLlmContextWindow(modelId))/4)), temperature: 0.5 })
    for await (const part of completion) { signal.throwIfAborted(); const text = part.choices[0]?.delta?.content; if (text) yield text }
  } finally { signal.removeEventListener('abort', stop); release() }
}
