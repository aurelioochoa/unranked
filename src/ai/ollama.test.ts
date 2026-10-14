import { describe, it, expect, vi } from 'vitest'
import { OllamaNarrator, nativeBaseUrl } from './ollama'
import type { AiConfig } from './config'
import type { AiCallRecord, QuestContext } from './types'

const CONFIG: AiConfig = {
  provider: 'ollama',
  model: 'qwen3.5:4b',
  baseUrl: 'http://localhost:11434/v1',
  maxOutputTokens: 200,
  thinking: false,
  reasoningTokens: 3000,
  thinkingTimeoutMs: 60_000,
}

const ctx: QuestContext = {
  hunterName: 'Aurelio',
  level: 7,
  rank: 'E',
  dayKey: '2026-01-15',
  quests: [{ title: 'Strength Training', multiplier: 0.46 }],
  debuff: 0.9,
  activePenalties: 1,
}

function ndjson(lines: object[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const l of lines) controller.enqueue(encoder.encode(JSON.stringify(l) + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const c of stream) out += c
  return out
}

describe('nativeBaseUrl', () => {
  it('strips the OpenAI-compatible suffix', () => {
    expect(nativeBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434')
    expect(nativeBaseUrl('http://localhost:11434/v1/')).toBe('http://localhost:11434')
  })

  it('leaves a native url alone', () => {
    expect(nativeBaseUrl('http://box:11434')).toBe('http://box:11434')
  })

  it('falls back to the local default', () => {
    expect(nativeBaseUrl(undefined)).toBe('http://localhost:11434')
    expect(nativeBaseUrl('  ')).toBe('http://localhost:11434')
  })
})

describe('OllamaNarrator', () => {
  it('honours the configured thinking mode — the reason this adapter exists', async () => {
    const fetchImpl = vi.fn(async () =>
      ndjson([{ message: { content: 'ok' } }, { done: true }]),
    ) as unknown as typeof fetch

    await collect(new OllamaNarrator(CONFIG, () => {}, fetchImpl).narrateQuestIssue(ctx))

    const [url, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!
    expect(url).toBe('http://localhost:11434/api/chat')
    const body = JSON.parse(String(init.body))
    expect(body.think).toBe(false)
    expect(body.model).toBe('qwen3.5:4b')
    expect(body.stream).toBe(true)
  })

  it('assembles a streamed answer from newline-delimited json', async () => {
    const fetchImpl = (async () =>
      ndjson([
        { message: { content: '[Daily Quest ' } },
        { message: { content: 'has arrived.] ' } },
        { message: { content: 'Two tasks.' } },
        { done: true },
      ])) as unknown as typeof fetch

    const out = await collect(new OllamaNarrator(CONFIG, () => {}, fetchImpl).narrateQuestIssue(ctx))
    expect(out).toBe('[Daily Quest has arrived.] Two tasks.')
  })

  it('tolerates a chunk boundary splitting a json line', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const e = new TextEncoder()
        controller.enqueue(e.encode('{"message":{"content":"half'))
        controller.enqueue(e.encode(' a line"}}\n{"done":true}\n'))
        controller.close()
      },
    })
    const fetchImpl = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch
    expect(await collect(new OllamaNarrator(CONFIG, () => {}, fetchImpl).narrateQuestIssue(ctx))).toBe(
      'half a line',
    )
  })

  it('falls back to the authored System when ollama is unreachable', async () => {
    const calls: AiCallRecord[] = []
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch

    const out = await collect(
      new OllamaNarrator(CONFIG, (r) => calls.push(r), fetchImpl).narrateQuestIssue(ctx),
    )
    expect(out).toContain('Daily Quest')
    expect(calls[0]!.ok).toBe(false)
    expect(calls[0]!.fellBack).toBe(true)
    expect(calls[0]!.error).toMatch(/ECONNREFUSED/)
  })

  it('falls back on a non-200', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    const out = await collect(new OllamaNarrator(CONFIG, () => {}, fetchImpl).narrateQuestIssue(ctx))
    expect(out).toContain('Daily Quest')
  })

  it('falls back when the model still returns nothing visible', async () => {
    const calls: AiCallRecord[] = []
    const fetchImpl = (async () => ndjson([{ message: { content: '   ' } }, { done: true }])) as unknown as typeof fetch
    const out = await collect(
      new OllamaNarrator(CONFIG, (r) => calls.push(r), fetchImpl).narrateQuestIssue(ctx),
    )
    expect(out).toContain('Daily Quest')
    expect(calls[0]!.fellBack).toBe(true)
    expect(calls[0]!.error).toMatch(/empty/i)
  })

  it('surfaces an error reported inside the stream', async () => {
    const fetchImpl = (async () => ndjson([{ error: 'model not found' }])) as unknown as typeof fetch
    const calls: AiCallRecord[] = []
    await collect(new OllamaNarrator(CONFIG, (r) => calls.push(r), fetchImpl).narrateQuestIssue(ctx))
    expect(calls[0]!.error).toMatch(/model not found/)
  })

  it('constrains structured output with a json schema and never invents a promotion', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ message: { content: '{"not":"valid"}' } }), { status: 200 }),
    ) as unknown as typeof fetch

    const verdict = await new OllamaNarrator(CONFIG, () => {}, fetchImpl).judgeFeat(
      { title: 'Ran a marathon', narrative: '3h52.', evidenceKind: 'PHOTO' },
      {
        hunterName: 'Aurelio', level: 7, rank: 'E', daysActive: 30,
        completionRate: 0.7, stalestQuests: [], strongestTrack: 'MIND', weakestTrack: 'BODY',
      },
    )
    expect(verdict.accepted).toBe(false)
    expect(verdict.rankAwarded).toBeNull()

    const body = JSON.parse(String((fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1].body))
    expect(body.format).toBeTypeOf('object')
    expect(body.think).toBe(false)
  })
})

describe('thinking models', () => {
  const THINKING: AiConfig = { ...CONFIG, thinking: true, reasoningTokens: 3000 }

  it('asks for reasoning and budgets for it on top of the answer', async () => {
    const fetchImpl = vi.fn(async () =>
      ndjson([{ message: { content: 'answered' } }, { done: true }]),
    ) as unknown as typeof fetch

    await collect(new OllamaNarrator(THINKING, () => {}, fetchImpl).narrateQuestIssue(ctx))

    const body = JSON.parse(String((fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]![1].body))
    expect(body.think).toBe(true)
    // The budget must cover reasoning AND the answer, or the answer never lands.
    expect(body.options.num_predict).toBe(THINKING.maxOutputTokens + THINKING.reasoningTokens)
  })

  it('retries without thinking when reasoning consumed the whole budget', async () => {
    // The exact measured failure: a thinking model returns only reasoning.
    const calls: AiCallRecord[] = []
    let n = 0
    const fetchImpl = (async () => {
      n++
      return n === 1
        ? ndjson([{ message: { content: '' } }, { done: true }])
        : ndjson([{ message: { content: '[Daily Quest has arrived.]' } }, { done: true }])
    }) as unknown as typeof fetch

    const out = await collect(
      new OllamaNarrator(THINKING, (r) => calls.push(r), fetchImpl).narrateQuestIssue(ctx),
    )

    expect(n).toBe(2)
    expect(out).toBe('[Daily Quest has arrived.]')
    expect(calls[0]!.error).toMatch(/thinking=true/)
    expect(calls[1]!.fellBack).toBe(false)
  })

  it('makes exactly one request when thinking is off', async () => {
    let n = 0
    const fetchImpl = (async () => {
      n++
      return ndjson([{ message: { content: 'ok' } }, { done: true }])
    }) as unknown as typeof fetch
    await collect(new OllamaNarrator(CONFIG, () => {}, fetchImpl).narrateQuestIssue(ctx))
    expect(n).toBe(1)
  })

  it('still reaches the authored System if both attempts come back empty', async () => {
    const fetchImpl = (async () => ndjson([{ message: { content: '' } }, { done: true }])) as unknown as typeof fetch
    const out = await collect(new OllamaNarrator(THINKING, () => {}, fetchImpl).narrateQuestIssue(ctx))
    expect(out).toContain('Daily Quest')
  })
})

describe('the thinking deadline', () => {
  it('abandons a thinking attempt that will not stop, and still speaks', async () => {
    // The measured failure: 178s of reasoning and no answer. Bounded here.
    const calls: AiCallRecord[] = []
    let attempt = 0

    const fetchImpl = (async (_url: string, init: RequestInit) => {
      attempt++
      if (attempt === 1) {
        // A request that never resolves until its signal aborts.
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        })
      }
      return ndjson([{ message: { content: '[Daily Quest has arrived.]' } }, { done: true }])
    }) as unknown as typeof fetch

    const narrator = new OllamaNarrator(
      { ...CONFIG, thinking: true, thinkingTimeoutMs: 30 },
      (r) => calls.push(r),
      fetchImpl,
    )

    const out = await collect(narrator.narrateQuestIssue(ctx))

    expect(attempt).toBe(2)
    expect(out).toBe('[Daily Quest has arrived.]')
    expect(calls[0]!.error).toMatch(/thinking exceeded 30ms/)
    expect(calls[1]!.fellBack).toBe(false)
  })

  it('does not put a deadline on a non-thinking attempt', async () => {
    let sawSignal: AbortSignal | null | undefined
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sawSignal = init.signal
      return ndjson([{ message: { content: 'ok' } }, { done: true }])
    }) as unknown as typeof fetch

    await collect(new OllamaNarrator(CONFIG, () => {}, fetchImpl).narrateQuestIssue(ctx))
    // A signal is always passed, but nothing ever aborts it when not thinking.
    await new Promise((r) => setTimeout(r, 20))
    expect(sawSignal?.aborted).toBe(false)
  })
})
