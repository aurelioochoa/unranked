import { describe, it, expect } from 'vitest'
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test'
import { LlmNarrator } from './llm'
import { NullNarrator } from './null'
import { createNarrator } from './index'
import { aiConfigFromEnv, DEFAULT_MODELS, type AiConfig } from './config'
import type { AiCallRecord, DungeonContext, HunterHistory, PenaltyContext, QuestContext, SystemNarrator } from './types'

/** LanguageModelV4 reports finish reasons as objects, not bare strings. */
function finish(unified: 'stop' | 'length') {
  return { unified, raw: unified }
}

/** LanguageModelV4 reports token counts as structured objects, not bare numbers. */
function usage(input: number, output: number) {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
    totalTokens: input + output,
  }
}

const CONFIG: AiConfig = {
  provider: 'ollama',
  model: 'deepseek-r1',
  baseUrl: 'http://localhost:11434/v1',
  maxOutputTokens: 100,
  thinking: false,
  reasoningTokens: 3000,
  thinkingTimeoutMs: 60_000,
}

const questCtx: QuestContext = {
  hunterName: 'Aurelio',
  level: 7,
  rank: 'E',
  dayKey: '2026-01-15',
  quests: [
    { title: 'Strength Training', multiplier: 0.42 },
    { title: 'Seven Hours', multiplier: 1 },
  ],
  debuff: 0.9,
  activePenalties: 1,
}

const penaltyCtx: PenaltyContext = {
  hunterName: 'Aurelio',
  missedTitles: ['Strength Training'],
  requirement: 'Clear it again, and prove it.',
  escalation: 0,
  deadlineInHours: 24,
}

const dungeonCtx: DungeonContext = {
  objective: 'Ship the migration',
  track: 'WORK',
  minutes: 50,
  outcome: 'CLEARED',
  xp: 200,
  loot: ['Lesser Mana Crystal'],
}

const history: HunterHistory = {
  hunterName: 'Aurelio',
  level: 7,
  rank: 'E',
  daysActive: 30,
  completionRate: 0.72,
  stalestQuests: ['Face the Numbers'],
  strongestTrack: 'MIND',
  weakestTrack: 'BODY',
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = ''
  for await (const chunk of stream) out += chunk
  return out
}

/** Every adapter must pass this. Adding a provider is then a bounded job. */
function conformanceSuite(name: string, make: () => SystemNarrator) {
  describe(`conformance: ${name}`, () => {
    it('narrates a quest issue as non-empty text', async () => {
      expect((await collect(make().narrateQuestIssue(questCtx))).trim().length).toBeGreaterThan(20)
    })

    it('narrates a penalty as non-empty text', async () => {
      expect((await collect(make().narratePenalty(penaltyCtx))).trim().length).toBeGreaterThan(20)
    })

    it('narrates a level up as non-empty text', async () => {
      const out = await collect(make().narrateLevelUp({ hunterName: 'A', level: 8, pointsGranted: 3 }))
      expect(out.trim().length).toBeGreaterThan(10)
    })

    it('narrates every dungeon outcome', async () => {
      for (const outcome of ['CLEARED', 'FLED', 'EXPIRED'] as const) {
        const out = await collect(make().narrateDungeon({ ...dungeonCtx, outcome }))
        expect(out.trim().length).toBeGreaterThan(10)
      }
    })

    it('returns a complete scenario', async () => {
      const s = await make().weeklyScenario(history)
      for (const v of [s.title, s.narration, s.clearCondition, s.failurePenalty]) {
        expect(v.trim().length).toBeGreaterThan(0)
      }
    })

    it('returns a verdict that never promotes without accepting', async () => {
      const v = await make().judgeFeat(
        { title: 'Ran a marathon', narrative: 'Under four hours.', evidenceKind: 'PHOTO' },
        history,
      )
      expect(typeof v.accepted).toBe('boolean')
      expect(v.reasoning.trim().length).toBeGreaterThan(0)
      if (!v.accepted) expect(v.rankAwarded).toBeNull()
    })

    it('exposes an id', () => {
      expect(make().id.length).toBeGreaterThan(0)
    })
  })
}

function streamingModel(chunks: string[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start' as const, id: '0' },
          ...chunks.map((c) => ({ type: 'text-delta' as const, id: '0', delta: c })),
          { type: 'text-end' as const, id: '0' },
          {
            type: 'finish' as const,
            finishReason: finish('stop'),
            usage: usage(10, chunks.length),
          },
        ],
      }),
    }),
  })
}

conformanceSuite('NullNarrator', () => new NullNarrator())
conformanceSuite('LlmNarrator (healthy model)', () =>
  new LlmNarrator(streamingModel(['[Daily Quest has arrived.] ', 'Two tasks. Failure carries a penalty.']), CONFIG),
)

describe('the reasoning-model guard', () => {
  it('retries once, then falls back, when the model returns empty visible output', async () => {
    const calls: AiCallRecord[] = []
    let attempts = 0
    const model = new MockLanguageModelV4({
      doStream: async () => {
        attempts++
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-start' as const, id: '0' },
              { type: 'text-delta' as const, id: '0', delta: '' },
              { type: 'text-end' as const, id: '0' },
              {
                type: 'finish' as const,
                finishReason: finish('length'),
                usage: usage(20, 100),
              },
            ],
          }),
        }
      },
    })

    const narrator = new LlmNarrator(model, CONFIG, (r) => calls.push(r))
    const out = await collect(narrator.narrateQuestIssue(questCtx))

    expect(attempts).toBe(2)
    expect(out.trim().length).toBeGreaterThan(20)
    expect(out).toContain('Daily Quest')
    expect(calls.at(-1)!.fellBack).toBe(true)
    expect(calls.at(-1)!.error).toMatch(/empty/i)
  })

  it('raises the token budget on the retry', async () => {
    const budgets: (number | undefined)[] = []
    const model = new MockLanguageModelV4({
      doStream: async (opts) => {
        budgets.push(opts.maxOutputTokens)
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'text-start' as const, id: '0' },
              { type: 'text-end' as const, id: '0' },
              {
                type: 'finish' as const,
                finishReason: finish('length'),
                usage: usage(1, 0),
              },
            ],
          }),
        }
      },
    })
    await collect(new LlmNarrator(model, CONFIG).narrateQuestIssue(questCtx))
    expect(budgets).toHaveLength(2)
    expect(budgets[1]!).toBeGreaterThan(budgets[0]!)
  })

  it('never emits a false start before falling back', async () => {
    // The blank first attempt must not surface as an empty leading chunk.
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start' as const, id: '0' },
            { type: 'text-delta' as const, id: '0', delta: '   ' },
            { type: 'text-end' as const, id: '0' },
            {
              type: 'finish' as const,
              finishReason: finish('stop'),
              usage: usage(1, 1),
            },
          ],
        }),
      }),
    })
    const chunks: string[] = []
    for await (const c of new LlmNarrator(model, CONFIG).narrateQuestIssue(questCtx)) chunks.push(c)
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true)
  })
})

describe('failure handling', () => {
  it('falls back to the authored System when the model throws', async () => {
    const calls: AiCallRecord[] = []
    const model = new MockLanguageModelV4({
      doStream: async () => {
        throw new Error('connection refused')
      },
    })
    const out = await collect(new LlmNarrator(model, CONFIG, (r) => calls.push(r)).narratePenalty(penaltyCtx))
    expect(out).toContain('Penalty Zone')
    expect(calls.every((c) => !c.ok)).toBe(true)
    expect(calls.at(-1)!.error).toMatch(/connection refused/)
  })

  it('refuses a rank-up when the judge cannot be reached', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('offline')
      },
    })
    const v = await new LlmNarrator(model, CONFIG).judgeFeat(
      { title: 'Ran a marathon', narrative: '3h52.', evidenceKind: 'PHOTO' },
      history,
    )
    expect(v.accepted).toBe(false)
    expect(v.rankAwarded).toBeNull()
  })
})

describe('createNarrator', () => {
  it('returns the authored System when no provider is configured', () => {
    expect(createNarrator({ provider: 'none', model: '', maxOutputTokens: 100, thinking: false, reasoningTokens: 3000, thinkingTimeoutMs: 60_000 }).id).toBe('none')
  })

  it('degrades instead of throwing on a misconfigured provider', () => {
    const calls: AiCallRecord[] = []
    // openai-compatible without a base URL is a configuration error.
    const n = createNarrator(
      { provider: 'openai-compatible', model: 'x', maxOutputTokens: 100, thinking: false, reasoningTokens: 3000, thinkingTimeoutMs: 60_000 },
      (r) => calls.push(r),
    )
    expect(n.id).toBe('none')
    expect(calls[0]!.error).toMatch(/AI_BASE_URL/)
  })

  it('builds a live narrator for a real provider', () => {
    expect(createNarrator({ provider: 'anthropic', model: 'claude-sonnet-5', apiKey: 'k', maxOutputTokens: 100, thinking: false, reasoningTokens: 3000, thinkingTimeoutMs: 60_000 }).id).toBe(
      'anthropic:claude-sonnet-5',
    )
  })
})

describe('aiConfigFromEnv', () => {
  it('defaults to no provider at all', () => {
    expect(aiConfigFromEnv({}).provider).toBe('none')
  })

  it('falls back to none for an unknown provider name', () => {
    expect(aiConfigFromEnv({ AI_PROVIDER: 'skynet' }).provider).toBe('none')
  })

  it('supplies the ollama base url automatically', () => {
    const c = aiConfigFromEnv({ AI_PROVIDER: 'ollama' })
    expect(c.baseUrl).toContain('11434')
    expect(c.model).toBe(DEFAULT_MODELS.ollama)
  })

  it('honours explicit overrides', () => {
    const c = aiConfigFromEnv({ AI_PROVIDER: 'openai', AI_MODEL: 'gpt-5', AI_API_KEY: 'sk-x' })
    expect(c.model).toBe('gpt-5')
    expect(c.apiKey).toBe('sk-x')
  })
})
