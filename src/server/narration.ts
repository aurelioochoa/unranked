/**
 * Building the context the System narrates from.
 *
 * Shared deliberately: the server route and the in-browser engine must describe
 * the same day in the same terms, or switching provider would quietly change
 * what the System knows about you.
 */

import type { Db } from '@/db/client'
import { getDb } from '@/db/client'
import { listTemplates, questsFailedAt } from '@/db/questRepo'
import type { PenaltyContext, QuestContext } from '@/ai/types'
import { HUNTER_ID, type SystemView } from './session'

export function buildQuestContext(view: SystemView): QuestContext {
  return {
    hunterName: view.hunter.name,
    level: view.state.level,
    rank: view.hunter.rank,
    dayKey: view.dayKey,
    quests: view.quests
      .filter((q) => q.quest.status === 'ISSUED')
      .map((q) => ({ title: q.template.title, multiplier: q.multiplier })),
    debuff: view.debuff,
    activePenalties: view.penalties.length,
  }
}

export function buildPenaltyContext(view: SystemView, db: Db = getDb()): PenaltyContext | null {
  const p = view.penalties[0]
  if (!p) return null

  const titles = new Map(listTemplates(db, HUNTER_ID).map((t) => [t.id, t.title] as const))
  return {
    hunterName: view.hunter.name,
    // The quests this penalty is actually about: the ones failed at the instant
    // it was issued, not whatever happens to be failed today.
    missedTitles: questsFailedAt(db, HUNTER_ID, p.issuedAt).map(
      (q) => titles.get(q.templateId) ?? q.templateId,
    ),
    requirement: p.requirement,
    escalation: p.escalation,
    deadlineInHours: Math.max(0, Math.round((p.dueAt - Date.now()) / 3_600_000)),
  }
}
