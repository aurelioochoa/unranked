import type { AssistantEvent } from './types'
export function sameOrigin(request: Request): void {
  const origin = request.headers.get('origin')
  const expected = new URL(request.url).origin
  if (!origin || new URL(origin).origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site') throw new Error('same-origin request required')
}
export async function jsonBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('request body required')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength
      if (size > 65536) throw new Error('request body too large')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size); let at = 0
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length }
  return JSON.parse(new TextDecoder().decode(bytes))
}
export function errorResponse(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : 'request failed' }, { status: 400 }) }
export function eventStream(run: (send: (event: AssistantEvent) => void, signal: AbortSignal) => Promise<void>): Response {
  const encoder = new TextEncoder(); let cancelled = false; const abort = new AbortController()
  return new Response(new ReadableStream({
    async start(controller) {
      const send = (event: AssistantEvent) => { if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')) }
      try { await run(send, abort.signal) } catch (error) { send({ type: 'error', message: error instanceof Error ? error.message : 'assistant failed' }) }
      finally { if (!cancelled) { send({ type: 'done' }); controller.close() } }
    }, cancel() { cancelled = true; abort.abort() },
  }), { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } })
}
