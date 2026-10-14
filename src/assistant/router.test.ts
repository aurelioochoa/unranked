import { describe, expect, it } from 'vitest'
import { routeCommand, fromNeedle, resolveReference, draftToAction, isConfirmation, isCancellation } from './router'
import { preferencesSchema } from './schema'
import type { AssistantContext } from './types'
const ctx: AssistantContext = { at:1,awakened:true,hunter:{name:'Hunter',level:1,unspentPoints:4,timezone:'UTC',theme:'hologram'}, quests:[{id:'q1',title:'Read a chapter',status:'ISSUED'},{id:'q2',title:'Read another chapter',status:'ISSUED'}],templates:[],penalties:[],run:{id:'run',objective:'Read',endsAt:1000,state:'ACTIVE'},preferences:preferencesSchema.parse({}),history:[],readiness:{anthropic:false,openai:false} }
describe('bilingual command routing',()=>{
  it.each([['open settings','/system'],['Open settings.','/system'],['Abre ajustes.','/system'],['abre ajustes','/system'],['go to quests','/quests'],['ir a misiones','/quests']])('routes %s',(text,path)=>expect(routeCommand(text,ctx)?.navigate).toBe(path))
  it.each(['complete quest Read a chapter','completar mision Read a chapter'])('resolves named quest %s',text=>expect(routeCommand(text,ctx)?.actions).toEqual([{type:'completeQuest',questId:'q1'}]))
  it('clarifies ambiguous names and does not guess IDs',()=>{ expect(resolveReference('Read',ctx.quests)).toBeNull(); expect(routeCommand('complete quest Read',ctx)?.clarification).toBeTruthy() })
  it.each(['fill dungeon Write report for 25 minutes mind','prepara mazmorra Write report por 25 minutos mente'])('drafts without executing %s',text=>{const out=routeCommand(text,ctx)!;expect(out.actions).toBeUndefined();expect(out.draft).toEqual({form:'dungeon',values:{objective:'Write report',minutes:25,track:'MIND'}})})
  it('requires explicit submission of a complete draft',()=>{const draft={form:'dungeon' as const,values:{objective:'Read',minutes:25,track:'MIND' as const}};expect(routeCommand('start',ctx,draft)?.actions?.[0]).toMatchObject({type:'startDungeon'});expect(()=>draftToAction({form:'dungeon',values:{objective:'Read'}})).toThrow()})
  it('carries supplied fields across a follow-up',()=>{expect(routeCommand('start dungeon for 25 minutes mind',ctx,{form:'dungeon',values:{objective:'Read'}})?.actions).toEqual([{type:'startDungeon',objective:'Read',minutes:25,track:'MIND'}])})
  it.each(['set my name to Aurelio','cambia mi nombre a Aurelio'])('saves clear ordinary settings %s',text=>expect(routeCommand(text,ctx)?.actions).toEqual([{type:'settings',patch:{name:'Aurelio'}}]))
  it('keeps Awakening changes in its form draft',()=>expect(routeCommand('set my name to Aurelio',ctx,{form:'awakening',values:{}})?.draft).toEqual({form:'awakening',values:{name:'Aurelio'}}))
  it.each(['allocate 2 points to strength','asignar 2 puntos a fuerza','Allocate 2 points to strength.'])('routes spending %s',text=>expect(routeCommand(text,ctx)?.actions).toEqual([{type:'allocate',spend:{STR:2}}]))
  it('requires clarification for low confidence or missing arguments',()=>{
    expect(fromNeedle({confidence:0.6,function_calls:[{name:'fleeDungeon',arguments:{runId:'current'}}]},ctx)?.clarification).toBeTruthy()
    expect(fromNeedle({confidence:0.95,function_calls:[{name:'startDungeon',arguments:{objective:'Read'}}]},ctx)?.clarification).toBeTruthy()
  })
  it('retains ordered tools and resolves current records',()=>expect(fromNeedle({confidence:0.99,function_calls:[{name:'settings',arguments:{patch:{name:'Sage'}}},{name:'clearDungeon',arguments:{runId:'current'}}]},ctx)?.actions).toEqual([{type:'settings',patch:{name:'Sage'}},{type:'clearDungeon',runId:'run'}]))
  it('handles spoken yes/no exactly',()=>{expect(isConfirmation('sí')).toBe(true);expect(isConfirmation('yes but change it')).toBe(false);expect(isCancellation('cancelar')).toBe(true)})
  it('sends unrelated conversation to the conversational model',()=>expect(routeCommand('What is my best strategy?',ctx)).toBeNull())
})

describe('all existing app operations',()=>{
  it.each([['set reset hour to 6',{dailyResetHour:6}],['cambia misiones rotativas a 3',{rotatingQuestCount:3}],['set background to none',{background:'none'}],['set voice rate to 120',{voiceRate:120}],['set ai model to qwen3.5:4b',{aiModel:'qwen3.5:4b'}]])('routes %s',(text,patch)=>expect(routeCommand(text,ctx)?.actions).toEqual([{type:'settings',patch}]))
  it('changes daily selections or prepares them during Awakening',()=>{
    const selected={...ctx,templates:[{id:'t1',title:'Read daily',enabled:true,isCore:false}]}
    expect(routeCommand('make daily Read daily',selected)?.actions).toEqual([{type:'template',templateId:'t1',enabled:true,isCore:true}])
    expect(routeCommand('hacer diaria Read daily',selected,{form:'awakening',values:{core:[],enabled:[]}})?.draft).toEqual({form:'awakening',values:{core:['t1'],enabled:['t1']}})
  })
  it('drafts spending without mutating',()=>expect(routeCommand('fill allocate 2 points to strength',ctx)?.draft).toEqual({form:'allocation',values:{STR:2}}))
  it('accepts evidence only when a unique penalty is known',()=>{
    const current={...ctx,penalties:[{id:'p1',reason:'Walk'}]}
    expect(routeCommand('submit evidence Walked 20 minutes at 10:00',current)?.actions).toEqual([{type:'resolvePenalty',penaltyId:'p1',note:'Walked 20 minutes at 10:00',url:''}])
    expect(routeCommand('submit evidence Done',ctx)?.clarification).toBeTruthy()
  })
})
