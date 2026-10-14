/**
 * The System speaking.
 *
 * Streams narration as plain text so the client can render it token by token
 * AND start speaking the first sentence while the model is still writing the
 * rest. A single source feeds both — see src/ui/SystemSpeech.tsx.
 */

import { createNarrator } from '@/ai'
import { aiConfigFromEnv } from '@/ai/config'
import { getDb } from '@/db/client'
import { aiCalls } from '@/db/schema'
import { loadSystem, HUNTER_ID } from '@/server/session'
import { buildPenaltyContext, buildQuestContext } from '@/server/narration'
import { resolveAiConfig } from '@/ai/config'
import { requireHunter } from '@/db/hunters'
import type { SystemNarrator } from '@/ai/types'

export const dynamic = 'force-dynamic'

function narrator(db: ReturnType<typeof getDb>): SystemNarrator {
  // Settings override the environment; the key always comes from the env.
  const hunter = requireHunter(db, HUNTER_ID)
  const config = resolveAiConfig(aiConfigFromEnv(), {
    provider: hunter.aiProvider,
    model: hunter.aiModel,
    baseUrl: hunter.aiBaseUrl,
    thinking: hunter.aiThinking,
    reasoningTokens: hunter.aiReasoningTokens,
    thinkingTimeoutMs: hunter.aiThinkingTimeoutMs,
    maxOutputTokens: hunter.aiMaxOutputTokens,
  })

  // Every model call lands in ai_calls, so the AI layer is never a black box.
  return createNarrator(config, (record) => {
    try {
      db.insert(aiCalls)
        .values({
          id: crypto.randomUUID(),
          at: record.at,
          provider: record.provider,
          model: record.model,
          operation: record.operation,
          inputTokens: record.inputTokens ?? null,
          outputTokens: record.outputTokens ?? null,
          latencyMs: record.latencyMs ?? null,
          ok: record.ok,
          fellBack: record.fellBack,
          error: record.error ?? null,
        })
        .run()
    } catch {
      // Telemetry must never take down the narration it is describing.
    }
  })
}

function toResponse(stream: AsyncIterable<string>): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of stream) controller.enqueue(encoder.encode(chunk))
        } catch {
          // The narrator already falls back internally; if the stream itself
          // dies, close cleanly rather than hanging the client.
        }
        controller.close()
      },
    }),
    {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
      },
    },
  )
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { kind?: string }
  const db = getDb()
  const view = loadSystem()
  const n = narrator(db)

  const penalty = body.kind === 'penalty' ? buildPenaltyContext(view, db) : null
  if (penalty) return toResponse(n.narratePenalty(penalty))

  return toResponse(n.narrateQuestIssue(buildQuestContext(view)))
}

// Session identity lives in server/session, not route exports.
