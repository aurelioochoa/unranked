import { z } from 'zod'
import { bootstrap, HUNTER_ID } from '@/server/session'
import { loadAssistantContext } from '@/assistant/context'
import { serverConversation } from '@/assistant/providers'
import { conversationMessages } from '@/assistant/prompt'
import { saveMessage } from '@/assistant/storage'
import { sameOrigin, jsonBody, errorResponse, eventStream } from '@/assistant/http'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    sameOrigin(request)
    const { text, id } = z.object({ text: z.string().trim().min(1).max(4000), id: z.uuid() }).strict().parse(await jsonBody(request))
    const context = loadAssistantContext()
    const messages = conversationMessages(context, text)
    const { db } = bootstrap()
    saveMessage(db, HUNTER_ID, { id, role: 'user', text, at: Date.now() })
    return eventStream(async (send, streamSignal) => {
      let answer = ''
      const signal = AbortSignal.any([request.signal, streamSignal, AbortSignal.timeout(90000)])
      try {
        for await (const piece of serverConversation(context.preferences).stream(messages, signal)) { answer += piece; send({ type: 'text', text: piece }) }
        if (!answer.trim()) throw new Error('The model returned no answer. Check the selected model in assistant settings.')
      } finally {
        if (answer.trim()) saveMessage(db, HUNTER_ID, { id: crypto.randomUUID(), role: 'assistant', text: answer.slice(0,16000), at: Date.now() })
      }
    })
  } catch (error) { return errorResponse(error) }
}
