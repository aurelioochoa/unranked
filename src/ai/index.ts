/**
 * The AI gateway. Everything outside this directory sees only `SystemNarrator`.
 */

import { aiConfigFromEnv, type AiConfig } from './config'
import { LlmNarrator } from './llm'
import { resolveModel } from './model'
import { OllamaNarrator } from './ollama'
import { NullNarrator } from './null'
import type { AiCallSink, SystemNarrator } from './types'

export * from './types'
export { AI_PROVIDERS, DEFAULT_MODELS, aiConfigFromEnv, type AiConfig, type AiProvider } from './config'
export { NullNarrator } from './null'

/**
 * Build a narrator for the given config.
 *
 * Never throws on a misconfigured provider: a bad key or an unreachable Ollama
 * degrades to the authored System rather than taking the app down with it.
 */
export function createNarrator(
  config: AiConfig = aiConfigFromEnv(),
  sink: AiCallSink = () => {},
): SystemNarrator {
  try {
    // Ollama gets its own client: its OpenAI-compatible endpoint cannot turn
    // off a thinking model, so every call there returns empty. See ./ollama.ts.
    if (config.provider === 'ollama') return new OllamaNarrator(config, sink)

    const model = resolveModel(config)
    if (!model) return new NullNarrator()
    return new LlmNarrator(model, config, sink)
  } catch (err) {
    sink({
      at: Date.now(),
      provider: config.provider,
      model: config.model,
      operation: 'createNarrator',
      ok: false,
      fellBack: true,
      error: err instanceof Error ? err.message : String(err),
    })
    return new NullNarrator()
  }
}
