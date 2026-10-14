import { bootstrap, HUNTER_ID } from '@/server/session'
import { messageSchema } from '@/assistant/schema'
import { saveMessage, clearHistory } from '@/assistant/storage'
import { sameOrigin, jsonBody, errorResponse } from '@/assistant/http'
export async function POST(request: Request) {
  try { sameOrigin(request); saveMessage(bootstrap().db, HUNTER_ID, messageSchema.parse(await jsonBody(request))); return Response.json({ ok: true }) } catch (error) { return errorResponse(error) }
}
export async function DELETE(request: Request) {
  try { sameOrigin(request); clearHistory(bootstrap().db, HUNTER_ID); return Response.json({ ok: true }) } catch (error) { return errorResponse(error) }
}
