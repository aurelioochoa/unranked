import { z } from 'zod'
import { AI_PROVIDERS } from '@/ai/config'
import { DIFFICULTIES, STATS, TRACKS } from '@/domain/types'
import { VOICE_ADAPTERS, VOICE_POLICIES } from '@/voice/types'
import { isTheme } from '@/ui/themeGrounds'
import { isBackground } from '@/ui/backgrounds/registry'

const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max)
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  timezone: z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true } catch { return false } }, 'invalid time zone').optional(),
  theme: z.string().refine(isTheme, 'unknown theme').optional(),
  background: z.string().refine(isBackground, 'unknown background').optional(),
  dailyResetHour: int(0, 23).optional(), rotatingQuestCount: int(0, 8).optional(), difficulty: z.enum(DIFFICULTIES).optional(),
  aiProvider: z.enum(AI_PROVIDERS).optional(), aiModel: optionalText(200), aiBaseUrl: optionalText(2000), webllmModel: optionalText(200),
  aiThinking: z.union([z.boolean(), z.literal('on')]).optional(), aiThinkingPresent: z.string().optional(),
  aiMaxOutputTokens: z.union([z.literal(''), int(50, 4000), z.null()]).optional(),
  aiReasoningTokens: z.union([z.literal(''), int(0, 32000), z.null()]).optional(),
  aiThinkingTimeoutMs: z.union([z.literal(''), int(5000, 600000), z.null()]).optional(),
  voiceAdapter: z.enum(VOICE_ADAPTERS).optional(), voicePolicy: z.enum(VOICE_POLICIES).optional(), voiceId: optionalText(200),
  voiceRate: int(10, 200).optional(), voicePitch: int(10, 200).optional(), voiceVolume: int(0, 100).optional(),
}).strict()
export type SettingsPatch = z.infer<typeof settingsSchema>
const id = z.string().min(1).max(100)
export const allocationSchema = z.object(Object.fromEntries(STATS.map(s => [s, int(0, 10000).optional()])) as Record<typeof STATS[number], z.ZodOptional<z.ZodCoercedNumber<unknown>>>).strict()
export const awakeningSchema = z.object({
  name: z.string().trim().min(1).max(40), timezone: settingsSchema.shape.timezone.unwrap(),
  dailyResetHour: int(0, 23), rotatingQuestCount: int(0, 8), difficulty: z.enum(DIFFICULTIES),
  theme: settingsSchema.shape.theme.unwrap(), background: settingsSchema.shape.background.unwrap(),
  core: z.array(id).max(100), enabled: z.array(id).max(100),
}).strict()
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('completeQuest'), questId: id }),
  z.object({ type: z.literal('startDungeon'), objective: z.string().trim().min(1).max(140), track: z.enum(TRACKS), minutes: int(5, 240) }),
  z.object({ type: z.literal('clearDungeon'), runId: id }), z.object({ type: z.literal('fleeDungeon'), runId: id }),
  z.object({ type: z.literal('allocate'), spend: allocationSchema.refine(value => Object.values(value).some(points => points !== undefined && points > 0), 'choose at least one stat point') }),
  z.object({ type: z.literal('resolvePenalty'), penaltyId: id, note: z.string().max(4000).default(''), url: z.string().max(2048).default('') }),
  z.object({ type: z.literal('settings'), patch: settingsSchema }),
  z.object({ type: z.literal('template'), templateId: id, enabled: z.boolean().optional(), isCore: z.boolean().optional() }).refine(v => v.enabled !== undefined || v.isCore !== undefined),
  z.object({ type: z.literal('awaken'), answers: awakeningSchema }),
  z.object({ type: z.literal('replayAwakening') }), z.object({ type: z.literal('rebuildLedger') }),
])
export type AppAction = z.infer<typeof actionSchema>
export const batchSchema = z.object({ requestId: z.uuid(), actions: z.array(actionSchema).min(1).max(12), confirmation: z.uuid().optional() }).strict()
export type ActionBatch = z.infer<typeof batchSchema>
export const providerSettingsSchema = z.object({ model: z.string().trim().min(1).max(200), endpoint: z.string().url().max(2000).optional() }).strict()
export const preferencesSchema = z.object({
  name: z.string().trim().min(1).max(40).default('Great Sage'),
  style: z.string().trim().min(1).max(600).default('Calm, concise and analytical. Explain practical consequences. Reply in the user’s language.'),
  provider: z.enum(['ollama', 'webllm', 'anthropic', 'openai']).default('ollama'),
  providers: z.object({
    ollama: providerSettingsSchema.default({ model: 'qwen3.5:4b', endpoint: 'http://localhost:11434' }),
    webllm: providerSettingsSchema.default({ model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC' }),
    anthropic: providerSettingsSchema.default({ model: 'claude-sonnet-5' }),
    openai: providerSettingsSchema.default({ model: 'gpt-4o-mini' }),
  }).default({ ollama: { model: 'qwen3.5:4b', endpoint: 'http://localhost:11434' }, webllm: { model: 'Llama-3.2-3B-Instruct-q4f16_1-MLC' }, anthropic: { model: 'claude-sonnet-5' }, openai: { model: 'gpt-4o-mini' } }),
  language: z.enum(['auto','en','es']).default('auto'), speak: z.boolean().default(true),
  englishVoice: z.string().default('en_US-ljspeech-high'), spanishVoice: z.string().default('es_MX-ald-medium'),
  rate: int(50, 200).default(100), volume: int(0, 100).default(80),
}).strict()
export type AssistantPreferences = z.infer<typeof preferencesSchema>
export const messageSchema = z.object({ id: z.uuid(), role: z.enum(['user', 'assistant']), text: z.string().min(1).max(16000), at: z.number().int().nonnegative() }).strict()
export type ConversationMessage = z.infer<typeof messageSchema>
