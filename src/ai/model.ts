/**
 * Turning a config into a model handle. The only file that knows which
 * provider SDKs exist.
 */

import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogle } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import { OLLAMA_DEFAULT_BASE_URL, type AiConfig } from './config'

export function resolveModel(config: AiConfig): LanguageModel | null {
  switch (config.provider) {
    case 'none':
      return null

    // Runs in the browser; there is nothing for the server to resolve.
    case 'webllm':
      return null

    case 'anthropic':
      return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY || config.apiKey, baseURL: config.baseUrl })(config.model)

    case 'openai':
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY || config.apiKey, baseURL: config.baseUrl })(config.model)

    case 'google':
      return createGoogle({ apiKey: config.apiKey, baseURL: config.baseUrl })(config.model)

    // Ollama speaks the OpenAI wire format. It needs no key, but some gateways
    // reject an empty Authorization header, so send a harmless placeholder.
    case 'ollama':
      return createOpenAICompatible({
        name: 'ollama',
        baseURL: config.baseUrl ?? OLLAMA_DEFAULT_BASE_URL,
        apiKey: config.apiKey ?? 'ollama',
      })(config.model)

    case 'openai-compatible': {
      if (!config.baseUrl) {
        throw new Error('AI_BASE_URL is required when AI_PROVIDER=openai-compatible')
      }
      return createOpenAICompatible({
        name: 'openai-compatible',
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      })(config.model)
    }
  }
}
