import { loadAssistantContext } from '@/assistant/context'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export function GET() { return Response.json(loadAssistantContext(), { headers: { 'cache-control': 'no-store' } }) }
