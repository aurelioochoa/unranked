import { createHash } from 'node:crypto'
import { eq, and } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { assistantExecutions } from '@/db/schema'
import { requireHunter, hunterState } from '@/db/hunters'
import * as services from '@/server/appServices'
import { batchSchema, type AppAction, type ActionBatch } from './schema'
import type { ActionResult, BatchResult } from './types'

export function formData(values: Record<string, unknown>): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue
    if (key === 'aiThinking') {
      form.set('aiThinkingPresent', '1')
      if (value === true || value === 'on') form.set(key, 'on')
    } else if (Array.isArray(value)) value.forEach(v => form.append(key, String(v)))
    else form.set(key, value === null ? '' : String(value))
  }
  return form
}
export function executeAction(db: Db, hunterId: string, action: AppAction): ActionResult {
  let data: unknown
  let message: string = ({ completeQuest:'Quest completed.', startDungeon:'Dungeon started.', clearDungeon:'Dungeon cleared.', fleeDungeon:'Dungeon fled.', allocate:'Ability points assigned.', resolvePenalty:'Evidence accepted. Penalty resolved.', settings:'Settings saved.', template:'Daily selection saved.', awaken:'Awakening accepted.', replayAwakening:'Awakening reopened.', rebuildLedger:'Ledger rebuilt.' } as const)[action.type]
  switch (action.type) {
    case 'completeQuest': { const result = services.completeQuestService(db, hunterId, action.questId); data = result; message = `Quest completed. ${result.reward.xp} XP earned.`; break }
    case 'startDungeon':
      data = services.startDungeonService(db, hunterId, formData(action))
      message = `Dungeon started: ${action.objective}, ${action.minutes} minutes.`
      break
    case 'clearDungeon': data = services.clearDungeonService(db, hunterId, action.runId); break
    case 'fleeDungeon': data = services.fleeDungeonService(db, hunterId, action.runId); break
    case 'allocate': services.allocateService(db, hunterId, formData(action.spend)); break
    case 'resolvePenalty': services.resolvePenaltyService(db, hunterId, formData(action)); break
    case 'settings': services.updateSettingsService(db, hunterId, formData(action.patch)); break
    case 'template':
      if (action.enabled !== undefined) services.toggleTemplateService(db, hunterId, action.templateId, action.enabled)
      if (action.isCore !== undefined) services.toggleCoreService(db, hunterId, action.templateId, action.isCore)
      break
    case 'awaken': services.awakenService(db, hunterId, formData(action.answers)); break
    case 'replayAwakening': services.replayAwakeningService(db, hunterId); break
    case 'rebuildLedger': services.rebuildLedgerService(db, hunterId); break
  }
  const state = hunterState(requireHunter(db, hunterId))
  return { type: action.type, ok: true, message, data: data ?? { level: state.level, unspentPoints: state.unspentPoints } }
}
const sensitive = (action: AppAction) => ['fleeDungeon', 'allocate', 'awaken'].includes(action.type)
function prompt(action: AppAction): string {
  if (action.type === 'allocate') return `Spend stat points: ${JSON.stringify(action.spend)}? / ¿Asignar estos puntos?`
  if (action.type === 'fleeDungeon') return 'Flee this dungeon? Rewards are reduced and there is no loot. / ¿Huir de esta mazmorra?'
  return 'Accept the final Awakening with these answers? / ¿Aceptar el Despertar con estas respuestas?'
}

/** Each mutation and its execution receipt commit together. Retry never repeats a completed action. */
export function executeBatch(db: Db, hunterId: string, input: ActionBatch): BatchResult {
  const batch = batchSchema.parse(input)
  const fingerprint = createHash('sha256').update(JSON.stringify(batch.actions)).digest('hex')
  return db.transaction(() => {
    const stored = db.select().from(assistantExecutions).where(eq(assistantExecutions.id, batch.requestId)).get()
    if (stored && (stored.hunterId !== hunterId || stored.fingerprint !== fingerprint)) throw new Error('request id was already used for different actions')
    let result: BatchResult = stored?.result ?? { requestId: batch.requestId, results: [], status: 'done' }
    let nextIndex = stored?.nextIndex ?? 0
    if (stored) {
      if (result.status !== 'confirmation') return result
      if (!batch.confirmation) return result
      if (stored.expiresAt === null || stored.expiresAt <= Date.now()) throw new Error('confirmation expired; request the action again')
      if (batch.confirmation !== result.confirmation?.token) throw new Error('invalid confirmation')
    } else if (batch.confirmation) throw new Error('there is no pending confirmation')
    let confirmed = Boolean(batch.confirmation)
    result = { requestId: batch.requestId, results: [...result.results], status: 'done' }
    for (; nextIndex < batch.actions.length; nextIndex++) {
      const action = batch.actions[nextIndex]!
      if (sensitive(action) && !confirmed) {
        result.status = 'confirmation'
        result.confirmation = { token: crypto.randomUUID(), prompt: prompt(action), expiresAt: Date.now() + 120000, actions: batch.actions }
        break
      }
      confirmed = false
      try {
        // Savepoint rolls back evidence and other partial writes if a service throws.
        const outcome = db.transaction(() => executeAction(db, hunterId, action))
        result.results.push(outcome)
      } catch (error) {
        result.results.push({ type: action.type, ok: false, message: error instanceof Error ? error.message : String(error) })
        result.status = 'failed'
        break
      }
    }
    db.insert(assistantExecutions).values({ id: batch.requestId, hunterId, fingerprint, result, nextIndex, at: Date.now(), expiresAt: result.confirmation?.expiresAt ?? null })
      .onConflictDoUpdate({ target: assistantExecutions.id, set: { result, nextIndex, expiresAt: result.confirmation?.expiresAt ?? null } }).run()
    return result
  })
}
export function cancelConfirmation(db: Db, hunterId: string, requestId: string): void {
  const row = db.select().from(assistantExecutions).where(and(eq(assistantExecutions.id, requestId), eq(assistantExecutions.hunterId, hunterId))).get()
  if (row?.result.status !== 'confirmation') return
  db.update(assistantExecutions).set({ result: { requestId, status: 'failed', results: [...row.result.results, { type: row.result.confirmation!.actions[row.nextIndex]!.type, ok: false, message: 'Cancelled.' }] }, expiresAt: null }).where(eq(assistantExecutions.id, requestId)).run()
}
