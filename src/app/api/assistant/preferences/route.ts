import { bootstrap, HUNTER_ID } from '@/server/session'
import { preferencesSchema } from '@/assistant/schema'
import { savePreferences } from '@/assistant/storage'
import { sameOrigin, jsonBody, errorResponse } from '@/assistant/http'
export async function PUT(request: Request) {
  try { sameOrigin(request); return Response.json(savePreferences(bootstrap().db, HUNTER_ID, preferencesSchema.parse(await jsonBody(request)))) } catch (error) { return errorResponse(error) }
}
