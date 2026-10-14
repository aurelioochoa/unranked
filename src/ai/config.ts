/**
 * Provider configuration.
 *
 * Every provider is optional and every one of them can be swapped for another
 * without touching a call site — including `none`, which is a supported way to
 * run the whole app.
 */

export const AI_PROVIDERS = [
  'none',
  'webllm',
  'anthropic',
  'openai',
  'google',
  'ollama',
  'openai-compatible',
] as const

/**
 * `webllm` runs the model in the viewer's own browser over WebGPU, so it is the
 * one provider the server cannot execute. The narration path inverts for it:
 * the page generates locally instead of calling /api/narrate. Everything else
 * about it — prompts, voice, the authored fallback — is unchanged.
 */
export function isBrowserProvider(provider: AiProvider): boolean {
  return provider === 'webllm'
}

export type AiProvider = (typeof AI_PROVIDERS)[number]

export interface AiConfig {
  readonly provider: AiProvider
  readonly model: string
  readonly baseUrl?: string
  readonly apiKey?: string
  /** Budget for the answer itself. */
  readonly maxOutputTokens: number
  /** Let the model reason before answering. Better lines, much slower. */
  readonly thinking: boolean
  /**
   * Extra budget for hidden reasoning, on top of `maxOutputTokens`.
   *
   * Not a guess. Measured against a local qwen3.5:4b asked for a two-sentence
   * System line: ~1100 reasoning tokens to reach an answer, and anything under
   * roughly 1200 total returns empty content having spent the lot on thinking.
   * 3000 leaves real headroom; the default is deliberately generous because
   * the failure it prevents is silent.
   */
  readonly reasoningTokens: number
  /**
   * How long a thinking attempt may run before it is abandoned and retried
   * without thinking.
   *
   * Local thinking models do not reliably stop. Measured on qwen3.5:4b with a
   * real quest-issue prompt: one attempt ran 178 seconds and still returned
   * only reasoning, while the non-thinking retry answered in 6.6. Without this
   * ceiling the worst case is unbounded, and it lands on someone waiting to be
   * told what to do today.
   */
  readonly thinkingTimeoutMs: number
}

/** Sensible model per provider, used when AI_MODEL is not set. */
/** A small, widely-supported default; the picker lists everything available. */
export const DEFAULT_WEBLLM_MODEL = 'Llama-3.2-3B-Instruct-q4f16_1-MLC'

export const DEFAULT_MODELS: Readonly<Record<AiProvider, string>> = Object.freeze({
  none: '',
  webllm: DEFAULT_WEBLLM_MODEL,
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
  ollama: 'llama3.1',
  'openai-compatible': 'llama3.1',
})

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1'

function isProvider(v: string): v is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(v)
}

export type EnvLike = Readonly<Record<string, string | undefined>>

/**
 * Per-hunter overrides, stored in the database so Settings can change them
 * without an edit-and-restart. A null or undefined field defers to the
 * environment. The API key is never among these — see the schema comment.
 */
export interface AiOverrides {
  readonly provider?: string | null
  readonly model?: string | null
  readonly baseUrl?: string | null
  readonly thinking?: boolean | null
  readonly reasoningTokens?: number | null
  readonly thinkingTimeoutMs?: number | null
  readonly maxOutputTokens?: number | null
}

/** Settings win over the environment; the environment supplies the secret. */
export function resolveAiConfig(base: AiConfig, overrides: AiOverrides = {}): AiConfig {
  const provider: AiProvider =
    overrides.provider && isProvider(overrides.provider) ? overrides.provider : base.provider

  // A model chosen for one provider is meaningless under another.
  const model =
    provider === base.provider
      ? overrides.model?.trim() || base.model
      : overrides.model?.trim() || DEFAULT_MODELS[provider]

  return {
    provider,
    model,
    baseUrl:
      overrides.baseUrl?.trim() ||
      (provider === 'ollama' ? (base.baseUrl ?? OLLAMA_DEFAULT_BASE_URL) : base.baseUrl),
    apiKey: base.apiKey,
    maxOutputTokens: overrides.maxOutputTokens ?? base.maxOutputTokens,
    thinking: overrides.thinking ?? base.thinking,
    reasoningTokens: overrides.reasoningTokens ?? base.reasoningTokens,
    thinkingTimeoutMs: overrides.thinkingTimeoutMs ?? base.thinkingTimeoutMs,
  }
}

export function aiConfigFromEnv(env: EnvLike = process.env): AiConfig {
  const raw = (env.AI_PROVIDER ?? 'none').trim().toLowerCase()
  const provider: AiProvider = isProvider(raw) ? raw : 'none'
  return {
    provider,
    model: env.AI_MODEL?.trim() || DEFAULT_MODELS[provider],
    baseUrl: env.AI_BASE_URL?.trim() || (provider === 'ollama' ? OLLAMA_DEFAULT_BASE_URL : undefined),
    apiKey: env.AI_API_KEY?.trim() || undefined,
    maxOutputTokens: Number(env.AI_MAX_OUTPUT_TOKENS ?? 400),
    // Thinking on by default: the lines are better. It costs real latency, so
    // AI_THINKING=off is the switch for a snappier System.
    thinking: (env.AI_THINKING ?? 'on').trim().toLowerCase() !== 'off',
    reasoningTokens: Number(env.AI_REASONING_TOKENS ?? 3000),
    thinkingTimeoutMs: Number(env.AI_THINKING_TIMEOUT_MS ?? 60_000),
  }
}
