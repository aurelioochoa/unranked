import type { AppAction, AssistantPreferences, ConversationMessage, SettingsPatch } from './schema'
import type { Stat, Track } from '@/domain/types'
export type FormId = 'dungeon' | 'settings' | 'allocation' | 'awakening' | 'evidence'
export interface FormValues {
  dungeon: { objective: string; track: Track; minutes: number }
  settings: SettingsPatch
  allocation: Partial<Record<Stat, number>>
  awakening: SettingsPatch & { core?: string[]; enabled?: string[]; step?: number }
  evidence: { penaltyId: string; note: string; url: string }
}
export type FormDraft = { [K in FormId]: { form: K; values: Partial<FormValues[K]> } }[FormId]
export interface FormBinding<K extends FormId = FormId> {
  id: K
  recordId?: string
  read(): FormValues[K]
  fill(values: Partial<FormValues[K]>): void
}
export interface AssistantContext {
  at: number
  awakened: boolean
  hunter: { name: string; level: number; unspentPoints: number; timezone: string; theme: string }
  quests: { id: string; title: string; status: string }[]
  templates: { id: string; title: string; enabled: boolean; isCore: boolean }[]
  penalties: { id: string; reason: string }[]
  run: { id: string; objective: string; endsAt: number; state: string } | null
  preferences: AssistantPreferences
  history: ConversationMessage[]
  readiness: { anthropic: boolean; openai: boolean }
}
export interface ActionResult { type: AppAction['type']; ok: boolean; message: string; data?: unknown }
export interface BatchResult {
  requestId: string; results: ActionResult[]; status: 'done' | 'failed' | 'confirmation'
  confirmation?: { token: string; prompt: string; expiresAt: number; actions: AppAction[] }
}
export type AssistantEvent =
  | { type: 'text'; text: string }
  | { type: 'actions'; result: BatchResult }
  | { type: 'clarification'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
export interface ConversationProvider {
  stream(messages: { role: 'system' | 'user' | 'assistant'; content: string }[], signal: AbortSignal): AsyncIterable<string>
}
export interface NeedleResult { suppressed_calls?: unknown[]; function_calls: { name: string; arguments: Record<string, unknown> }[]; confidence: number; reasoning?: string }
export interface RouteDecision { actions?: AppAction[]; draft?: FormDraft; navigate?: '/' | '/quests' | '/dungeon' | '/system' | '/awaken'; clarification?: string; reply?: string }
