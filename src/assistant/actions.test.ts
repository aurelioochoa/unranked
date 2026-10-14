import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { openTestDb, type Db } from '@/db/client'
import { createHunter, markAwakened, requireHunter, updateSettings, appendEvent } from '@/db/hunters'
import { seedTemplates } from '@/db/seedTemplates'
import { issueQuestsForDay, listTemplates } from '@/db/questRepo'
import { hunters, assistantExecutions, dungeonRuns, evidence, penalties, quests, statEvents } from '@/db/schema'
import { executeBatch, formData, cancelConfirmation } from './actions'
import { allocateService, completeQuestService, updateSettingsService, awakenService, toggleTemplateService } from '@/server/appServices'
import type { AppAction, ActionBatch } from './schema'
let db: Db
const batch = (...actions: AppAction[]): ActionBatch => ({ requestId: crypto.randomUUID(), actions })
beforeEach(() => {
  db = openTestDb()
  for (const id of ['mine','other']) { createHunter(db, { id, name: id }); seedTemplates(db,id); markAwakened(db,id) }
})
afterEach(() => { vi.useRealTimers() })
describe('assistant action safeguards', () => {
  it('preserves omitted settings but clears explicitly empty overrides', () => {
    updateSettings(db,'mine',{ aiModel:'custom', aiBaseUrl:'http://localhost:11434', webllmModel:'browser', aiMaxOutputTokens:900, aiReasoningTokens:1200, aiThinkingTimeoutMs:80000 })
    updateSettingsService(db,'mine',formData({ voiceVolume:30 }))
    expect(requireHunter(db,'mine')).toMatchObject({ voiceVolume:30, aiModel:'custom', aiBaseUrl:'http://localhost:11434', webllmModel:'browser', aiMaxOutputTokens:900, aiReasoningTokens:1200, aiThinkingTimeoutMs:80000 })
    updateSettingsService(db,'mine',formData({ aiModel:'', aiMaxOutputTokens:'' }))
    expect(requireHunter(db,'mine')).toMatchObject({ aiModel:null, aiMaxOutputTokens:null, webllmModel:'browser' })
  })
  it('rejects invalid settings and progression fields', () => {
    expect(() => updateSettingsService(db,'mine',formData({ timezone:'Bogus/Zone' }))).toThrow()
    expect(() => updateSettingsService(db,'mine',formData({ totalXp:999999 }))).toThrow()
    expect(() => updateSettingsService(db,'mine',formData({ dailyResetHour:25 }))).toThrow()
  })
  it('refuses another hunter’s quests and templates through buttons and assistant', () => {
    const quest = issueQuestsForDay(db,'other',Date.now())[0]!
    expect(() => completeQuestService(db,'mine',quest.id)).toThrow(/another hunter/)
    expect(executeBatch(db,'mine',batch({ type:'completeQuest', questId:quest.id })).status).toBe('failed')
    expect(() => toggleTemplateService(db,'mine',listTemplates(db,'other')[0]!.id,false)).toThrow()
  })
  it('requires Awakening for ordinary actions', () => {
    updateSettings(db,'mine',{})
    db.update(hunters).set({onboardedAt:null}).where(eq(hunters.id,'mine')).run()
    expect(executeBatch(db,'mine',batch({type:'startDungeon', objective:'Read', minutes:25, track:'MIND'})).status).toBe('failed')
  })
  it('deduplicates quest completion even after retry or a new request id', () => {
    const quest = issueQuestsForDay(db,'mine',Date.now())[0]!
    const request = batch({type:'completeQuest',questId:quest.id})
    const first = executeBatch(db,'mine',request)
    expect(first.status).toBe('done')
    const count = db.select().from(statEvents).all().length
    expect(executeBatch(db,'mine',request)).toEqual(first)
    expect(db.select().from(statEvents).all()).toHaveLength(count)
    expect(executeBatch(db,'mine',batch(...request.actions)).status).toBe('failed')
  })
  it('rejects reused ids for different actions or owners', () => {
    const request = batch({type:'settings',patch:{voiceVolume:30}}); executeBatch(db,'mine',request)
    expect(() => executeBatch(db,'mine',{...request,actions:[{type:'settings',patch:{voiceVolume:40}}]})).toThrow(/different/)
    expect(() => executeBatch(db,'other',request)).toThrow(/different/)
  })
  it('executes in order and stops at first failure, preserving prior successes', () => {
    const result = executeBatch(db,'mine',batch({type:'settings',patch:{voiceVolume:30}}, {type:'clearDungeon',runId:'missing'}, {type:'settings',patch:{voiceVolume:40}}))
    expect(result.status).toBe('failed'); expect(result.results.map(r => r.ok)).toEqual([true,false])
    expect(requireHunter(db,'mine').voiceVolume).toBe(30)
  })
  it('cannot clear early, accepts a served run, and refuses duplicate clear', () => {
    const started = executeBatch(db,'mine',batch({type:'startDungeon',objective:'Deep work',minutes:25,track:'WORK'}))
    const id = (started.results[0]!.data as {id:string}).id
    expect(executeBatch(db,'mine',batch({type:'clearDungeon',runId:id})).status).toBe('failed')
    db.update(dungeonRuns).set({startedAt:Date.now()-25*60000}).where(eq(dungeonRuns.id,id)).run()
    expect(executeBatch(db,'mine',batch({type:'clearDungeon',runId:id})).status).toBe('done')
    expect(executeBatch(db,'mine',batch({type:'clearDungeon',runId:id})).status).toBe('failed')
  })
  it('refuses fake elapsed time and another hunter’s dungeon', () => {
    expect(() => executeBatch(db,'mine',batch({type:'clearDungeon',runId:'missing',elapsedMs:999999} as AppAction))).not.toThrow() // unknown fields are discarded; no clock data reaches services
    executeBatch(db,'other',batch({type:'startDungeon',objective:'Read',minutes:25,track:'MIND'}))
    const row = db.select().from(dungeonRuns).where(eq(dungeonRuns.hunterId,'other')).get()!
    expect(executeBatch(db,'mine',batch({type:'clearDungeon',runId:row.id})).status).toBe('failed')
  })
  it('requires a valid expiring confirmation for fleeing; cancellation revokes it', () => {
    executeBatch(db,'mine',batch({type:'startDungeon',objective:'Read',minutes:25,track:'MIND'}))
    const run = db.select().from(dungeonRuns).get()!
    const request = batch({type:'fleeDungeon',runId:run.id}); const pending = executeBatch(db,'mine',request)
    expect(pending.status).toBe('confirmation'); expect(run.outcome).toBeNull()
    expect(() => executeBatch(db,'mine',{...request,confirmation:crypto.randomUUID()})).toThrow(/invalid confirmation/)
    cancelConfirmation(db,'mine',request.requestId)
    expect(executeBatch(db,'mine',{...request,confirmation:pending.confirmation!.token}).status).toBe('failed')
  })
  it('expires confirmations and rechecks state after confirmation', () => {
    const request = batch({type:'allocate',spend:{STR:1}}); const pending = executeBatch(db,'mine',request)
    db.update(assistantExecutions).set({expiresAt:Date.now()-1}).where(eq(assistantExecutions.id,request.requestId)).run()
    expect(() => executeBatch(db,'mine',{...request,confirmation:pending.confirmation!.token})).toThrow(/expired/)
    const next = batch({type:'allocate',spend:{STR:1}}); const confirmation = executeBatch(db,'mine',next)
    expect(executeBatch(db,'mine',{...next,confirmation:confirmation.confirmation!.token}).status).toBe('failed')
  })
  it('confirms each sensitive action separately and never spends twice', () => {
    appendEvent(db,{hunterId:'mine',source:'ADJUSTMENT',at:Date.now(),xp:10000})
    const request = batch({type:'allocate',spend:{STR:1}},{type:'allocate',spend:{INT:1}})
    const first = executeBatch(db,'mine',request)
    const second = executeBatch(db,'mine',{...request,confirmation:first.confirmation!.token})
    expect(second.status).toBe('confirmation'); expect(requireHunter(db,'mine').spentPoints).toBe(1)
    const done = executeBatch(db,'mine',{...request,confirmation:second.confirmation!.token})
    expect(done.status).toBe('done'); expect(requireHunter(db,'mine').spentPoints).toBe(2)
    executeBatch(db,'mine',{...request,confirmation:second.confirmation!.token})
    expect(requireHunter(db,'mine').spentPoints).toBe(2)
  })
  it('rejects invalid point counts in both entry points', () => {
    expect(() => allocateService(db,'mine',formData({}))).toThrow(/at least one/ )
    expect(() => allocateService(db,'mine',formData({STR:0}))).toThrow(/at least one/ )
    expect(() => allocateService(db,'mine',formData({STR:-1}))).toThrow()
    expect(() => allocateService(db,'mine',formData({STR:1.5}))).toThrow()
    expect(() => allocateService(db,'mine',formData({STR:1}))).toThrow()
  })
  it('requires penalty evidence, checks ownership, and rolls back stale submissions', () => {
    const quest = issueQuestsForDay(db,'mine',Date.now())[0]!
    db.insert(penalties).values({id:'p1',hunterId:'mine',sourceQuestId:quest.id,issuedAt:Date.now(),dueAt:Date.now()+100000,requirement:'Evidence required'}).run()
    expect(executeBatch(db,'mine',batch({type:'resolvePenalty',penaltyId:'p1',note:'',url:''})).status).toBe('failed')
    expect(executeBatch(db,'other',batch({type:'resolvePenalty',penaltyId:'p1',note:'Done',url:''})).status).toBe('failed')
    expect(db.select().from(evidence).all()).toHaveLength(0)
    expect(executeBatch(db,'mine',batch({type:'resolvePenalty',penaltyId:'p1',note:'Walked 20 minutes at 10:00',url:''})).status).toBe('done')
    expect(executeBatch(db,'mine',batch({type:'resolvePenalty',penaltyId:'p1',note:'Again',url:''})).status).toBe('failed')
    expect(db.select().from(evidence).all()).toHaveLength(1)
  })
  it('rejects stale quests', () => {
    const quest = issueQuestsForDay(db,'mine',Date.now())[0]!
    db.update(quests).set({dueAt:Date.now()-1}).where(eq(quests.id,quest.id)).run()
    expect(executeBatch(db,'mine',batch({type:'completeQuest',questId:quest.id})).status).toBe('failed')
  })
  it('requires all Awakening answers and owned enabled core selections', () => {
    expect(() => awakenService(db,'mine',formData({name:'Aurelio'}))).toThrow(/every Awakening/)
    const answers={name:'Aurelio',timezone:'UTC',dailyResetHour:4,rotatingQuestCount:2,difficulty:'NORMAL',theme:'hologram',background:'none',core:[],enabled:[]} as const
    expect(() => awakenService(db,'mine',formData({...answers,core:[listTemplates(db,'other')[0]!.id]}))).toThrow()
    const own=listTemplates(db,'mine')[0]!.id
    expect(() => awakenService(db,'mine',formData({...answers,core:[own],enabled:[]}))).toThrow(/enabled/)
    const request=batch({type:'awaken',answers:{...answers,core:[own],enabled:[own]}})
    const pending=executeBatch(db,'mine',request); expect(pending.status).toBe('confirmation')
    expect(executeBatch(db,'mine',{...request,confirmation:pending.confirmation!.token}).status).toBe('done')
  })
})
