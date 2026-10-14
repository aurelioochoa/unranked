import { bootstrap, HUNTER_ID, loadSystem } from '@/server/session'
import { listTemplates } from '@/db/questRepo'
import { getHistory, getPreferences } from './storage'
import type { AssistantContext } from './types'
export function loadAssistantContext(): AssistantContext {
  const { db } = bootstrap()
  const view = loadSystem()
  return {
    at: Date.now(), awakened: view.hunter.onboardedAt !== null,
    hunter: { name: view.hunter.name, level: view.state.level, unspentPoints: view.state.unspentPoints, timezone: view.hunter.timezone, theme: view.hunter.theme },
    quests: view.quests.map(q => ({ id: q.quest.id, title: q.template.title, status: q.quest.status })),
    templates: listTemplates(db, HUNTER_ID).map(t => ({ id: t.id, title: t.title, enabled: t.enabled, isCore: t.isCore })),
    penalties: view.penalties.map(p => ({ id: p.id, reason: p.requirement })),
    run: view.openRun ? { id: view.openRun.id, objective: view.openRun.objective, endsAt: view.openRun.startedAt + view.openRun.plannedMs, state: view.openRunState! } : null,
    preferences: getPreferences(db, HUNTER_ID), history: getHistory(db, HUNTER_ID),
    readiness: { anthropic: Boolean(process.env.ANTHROPIC_API_KEY || process.env.AI_API_KEY), openai: Boolean(process.env.OPENAI_API_KEY || process.env.AI_API_KEY) },
  }
}
