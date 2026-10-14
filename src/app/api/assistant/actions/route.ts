import { revalidatePath } from 'next/cache'
import { bootstrap, HUNTER_ID } from '@/server/session'
import { executeBatch, cancelConfirmation } from '@/assistant/actions'
import { batchSchema } from '@/assistant/schema'
import { sameOrigin, jsonBody, errorResponse, eventStream } from '@/assistant/http'
import { z } from 'zod'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    sameOrigin(request)
    const batch = batchSchema.parse(await jsonBody(request))
    const result = executeBatch(bootstrap().db, HUNTER_ID, batch)
    revalidatePath('/', 'layout')
    if (request.headers.get('accept') === 'application/x-ndjson') return eventStream(async send => { send({ type: 'actions', result }); if (result.confirmation) send({ type: 'clarification', text: result.confirmation.prompt }) })
    return Response.json(result)
  } catch (error) { return errorResponse(error) }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); const { requestId } = z.object({ requestId: z.uuid() }).parse(await jsonBody(request)); cancelConfirmation(bootstrap().db, HUNTER_ID, requestId); return Response.json({ ok: true }) } catch (error) { return errorResponse(error) }
}
