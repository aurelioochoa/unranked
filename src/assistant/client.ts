import type { AssistantEvent } from './types'
export async function api<T>(path: string, body?: unknown, method = 'POST', signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/assistant/${path}`, { method, signal, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status})`)
  return value as T
}
export async function* readEvents(response: Response): AsyncIterable<AssistantEvent> {
  if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'Assistant request failed') }
  if (!response.body) throw new Error('Assistant stream unavailable')
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
      if (done && buffer.trim()) lines.push(buffer)
      for (const line of lines) if (line.trim()) yield JSON.parse(line) as AssistantEvent
      if (done) return
    }
  } finally { await reader.cancel() }
}
