import { describe, it, expect } from 'vitest'
import {
  AI_PROVIDERS,
  DEFAULT_MODELS,
  DEFAULT_WEBLLM_MODEL,
  aiConfigFromEnv,
  isBrowserProvider,
  resolveAiConfig,
  type AiConfig,
} from './config'

const BASE: AiConfig = {
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  apiKey: 'sk-from-env',
  baseUrl: undefined,
  maxOutputTokens: 400,
  thinking: true,
  reasoningTokens: 3000,
  thinkingTimeoutMs: 60_000,
}

describe('isBrowserProvider', () => {
  it('is true only for the in-browser engine', () => {
    expect(isBrowserProvider('webllm')).toBe(true)
    for (const p of AI_PROVIDERS) {
      if (p !== 'webllm') expect(isBrowserProvider(p)).toBe(false)
    }
  })
})

describe('resolveAiConfig', () => {
  it('returns the environment untouched with no overrides', () => {
    expect(resolveAiConfig(BASE)).toEqual(BASE)
  })

  it('lets settings win over the environment', () => {
    const r = resolveAiConfig(BASE, { provider: 'openai', model: 'gpt-5' })
    expect(r.provider).toBe('openai')
    expect(r.model).toBe('gpt-5')
  })

  it('never takes the api key from settings — it only ever comes from the env', () => {
    // A key stored per-hunter would be read into a server component and could
    // reach rendered HTML. The type forbids it; this pins the behaviour.
    const r = resolveAiConfig(BASE, { provider: 'openai' } as never)
    expect(r.apiKey).toBe('sk-from-env')
  })

  it('swaps in the new provider’s default model when the provider changes', () => {
    // A model name is provider-specific: carrying claude-sonnet-5 over to
    // ollama would produce a confusing 404 rather than an obvious mistake.
    const r = resolveAiConfig(BASE, { provider: 'ollama' })
    expect(r.model).toBe(DEFAULT_MODELS.ollama)
  })

  it('keeps an explicit model even when the provider changes', () => {
    const r = resolveAiConfig(BASE, { provider: 'ollama', model: 'qwen3.5:4b' })
    expect(r.model).toBe('qwen3.5:4b')
  })

  it('defaults webllm to a model the catalogue actually ships', () => {
    expect(resolveAiConfig(BASE, { provider: 'webllm' }).model).toBe(DEFAULT_WEBLLM_MODEL)
  })

  it('treats null and empty string as "defer to the environment"', () => {
    const r = resolveAiConfig(BASE, { model: null, baseUrl: '   ', thinking: null })
    expect(r.model).toBe(BASE.model)
    expect(r.baseUrl).toBe(BASE.baseUrl)
    expect(r.thinking).toBe(BASE.thinking)
  })

  it('honours a stored thinking:false — false is a choice, not an absence', () => {
    expect(resolveAiConfig(BASE, { thinking: false }).thinking).toBe(false)
  })

  it('honours a stored zero reasoning budget', () => {
    expect(resolveAiConfig(BASE, { reasoningTokens: 0 }).reasoningTokens).toBe(0)
  })

  it('ignores a provider name it does not recognise', () => {
    const r = resolveAiConfig(BASE, { provider: 'skynet' })
    expect(r.provider).toBe(BASE.provider)
  })

  it('supplies the ollama endpoint when switching to it with none stored', () => {
    expect(resolveAiConfig(BASE, { provider: 'ollama' }).baseUrl).toContain('11434')
  })

  it('carries numeric overrides through', () => {
    const r = resolveAiConfig(BASE, {
      maxOutputTokens: 120,
      reasoningTokens: 8000,
      thinkingTimeoutMs: 15_000,
    })
    expect(r.maxOutputTokens).toBe(120)
    expect(r.reasoningTokens).toBe(8000)
    expect(r.thinkingTimeoutMs).toBe(15_000)
  })
})

describe('aiConfigFromEnv', () => {
  it('recognises the browser provider', () => {
    const c = aiConfigFromEnv({ AI_PROVIDER: 'webllm' })
    expect(c.provider).toBe('webllm')
    expect(c.model).toBe(DEFAULT_WEBLLM_MODEL)
  })
})
