import { streamText } from 'ai'
import { resolveModel } from '@/ai/model'
import type { AssistantPreferences } from './schema'
import type { ConversationProvider } from './types'

export function serverConversation(prefs: AssistantPreferences): ConversationProvider {
  const chosen = prefs.providers[prefs.provider]
  return {
    async *stream(messages, signal) {
      signal.throwIfAborted()
      if (prefs.provider === 'webllm') throw new Error('WebLLM conversation runs in your browser; download its model first.')
      if (prefs.provider === 'ollama') {
        const endpoint = (chosen.endpoint ?? 'http://localhost:11434').replace(/\/(?:v1|api)\/?$/, '').replace(/\/$/, '')
        const response = await fetch(`${endpoint}/api/chat`, { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: chosen.model, messages, stream: true, think: false, options: { num_predict: 700, num_ctx: 8192 } }) })
        if (!response.ok || !response.body) throw new Error(`Ollama returned ${response.status}. Start Ollama and install ${chosen.model}.`)
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
        try {
          for (;;) {
            signal.throwIfAborted()
            const { done, value } = await reader.read()
            buffer += decoder.decode(value, { stream: !done })
            const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
            if (done && buffer.trim()) lines.push(buffer)
            for (const line of lines) {
              if (!line.trim()) continue
              const part = JSON.parse(line)
              if (part.error) throw new Error(part.error)
              if (part.message?.content) yield part.message.content
            }
            if (done) break
          }
        } finally { await reader.cancel() }
        return
      }
      const apiKey = (prefs.provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : process.env.OPENAI_API_KEY) || process.env.AI_API_KEY
      if (!apiKey) throw new Error(`Set ${prefs.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} on the server. This is an optional paid service.`)
      const model = resolveModel({ provider: prefs.provider, model: chosen.model, baseUrl: chosen.endpoint, apiKey, maxOutputTokens: 700, thinking: false, reasoningTokens: 0, thinkingTimeoutMs: 60000 })
      if (!model) throw new Error('provider is unavailable')
      const output = streamText({ model, messages, abortSignal: signal, maxOutputTokens: 700 })
      for await (const text of output.textStream) yield text
    },
  }
}
