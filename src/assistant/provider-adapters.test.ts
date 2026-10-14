import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
const fake = vi.hoisted(() => ({ resolve: vi.fn(), stream: vi.fn() }))
vi.mock('@/ai/model', () => ({ resolveModel: fake.resolve }))
vi.mock('ai', () => ({ streamText: fake.stream }))
import { serverConversation } from './providers'
import { preferencesSchema } from './schema'
beforeEach(() => { fake.resolve.mockReset(); fake.stream.mockReset(); fake.resolve.mockReturnValue({ id: 'mock' }) })
afterEach(() => vi.unstubAllEnvs())
describe('optional paid adapters', () => {
  it.each(['anthropic','openai'] as const)('streams %s with a server key and caller cancellation', async provider => {
    vi.stubEnv(provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY','test-key')
    async function* stream() { yield 'Ready.' }
    fake.stream.mockReturnValue({ textStream: stream() })
    const controller = new AbortController(); const prefs = preferencesSchema.parse({ provider })
    let text = ''; for await (const part of serverConversation(prefs).stream([{ role:'user',content:'Hello' }],controller.signal)) text += part
    expect(text).toBe('Ready.')
    expect(fake.resolve.mock.calls[0]![0]).toMatchObject({ provider,apiKey:'test-key',thinking:false })
    expect(fake.stream.mock.calls[0]![0].abortSignal).toBe(controller.signal)
  })
  it('preserves legacy AI_API_KEY compatibility', async () => {
    vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('AI_API_KEY','legacy-test-key')
    async function* stream() { yield 'Ready.' };fake.stream.mockReturnValue({textStream:stream()})
    for await (const _ of serverConversation(preferencesSchema.parse({provider:'openai'})).stream([],new AbortController().signal)) {}
    expect(fake.resolve.mock.calls[0]![0].apiKey).toBe('legacy-test-key')
  })
  it('refuses missing credentials and does not switch providers', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY','');vi.stubEnv('AI_API_KEY','')
    await expect(async () => { for await (const _ of serverConversation(preferencesSchema.parse({provider:'anthropic'})).stream([],new AbortController().signal)) {} }).rejects.toThrow(/ANTHROPIC_API_KEY/)
    expect(fake.resolve).not.toHaveBeenCalled()
  })
})
