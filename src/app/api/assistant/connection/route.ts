import { sameOrigin, jsonBody, errorResponse } from '@/assistant/http'
import { preferencesSchema } from '@/assistant/schema'
import { serverConversation } from '@/assistant/providers'
export async function POST(request: Request) {
  const controller = new AbortController()
  try {
    sameOrigin(request)
    const prefs = preferencesSchema.parse(await jsonBody(request))
    const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(20000)])
    for await (const text of serverConversation(prefs).stream([{ role: 'user', content: 'Reply with Ready.' }], signal)) if (text.trim()) return Response.json({ ready: true, provider: prefs.provider, model: prefs.providers[prefs.provider].model })
    throw new Error('model returned no text')
  } catch (error) { return errorResponse(error) } finally { controller.abort() }
}
