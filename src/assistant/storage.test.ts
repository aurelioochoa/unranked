import { describe, expect, it } from 'vitest'
import { openTestDb } from '@/db/client'
import { createHunter } from '@/db/hunters'
import { getHistory, getPreferences, savePreferences, saveMessage, clearHistory } from './storage'
import { preferencesSchema } from './schema'
import { conversationMessages } from './prompt'
import type { AssistantContext } from './types'
describe('local preferences and history',()=>{
  it('defaults to Ollama and retains each provider’s model settings',()=>{
    const db=openTestDb();createHunter(db,{id:'mine',name:'Hunter'})
    const prefs=getPreferences(db,'mine');expect(prefs.provider).toBe('ollama');expect(prefs.providers.ollama.model).toBe('qwen3.5:4b')
    prefs.providers.openai.model='custom';prefs.providers.ollama.model='local-custom';prefs.provider='openai';savePreferences(db,'mine',prefs)
    expect(getPreferences(db,'mine').providers).toMatchObject({openai:{model:'custom'},ollama:{model:'local-custom'}})
  })
  it('stores only validated text, isolates owners, deduplicates messages and clears history',()=>{
    const db=openTestDb();for(const id of ['mine','other'])createHunter(db,{id,name:id})
    const message={id:crypto.randomUUID(),role:'user' as const,text:'Hello',at:1}
    saveMessage(db,'mine',message);saveMessage(db,'mine',message);expect(getHistory(db,'mine')).toHaveLength(1);expect(getHistory(db,'other')).toEqual([])
    expect(()=>saveMessage(db,'other',message)).toThrow(/already used/)
    expect(()=>saveMessage(db,'mine',{...message,id:crypto.randomUUID(),audio:'secret'} as typeof message)).toThrow()
    clearHistory(db,'mine');expect(getHistory(db,'mine')).toEqual([])
  })
  it('bounds conversation context and omits provider connection settings',()=>{
    const ctx:AssistantContext={at:1,awakened:true,hunter:{name:'Hunter',level:1,unspentPoints:0,timezone:'UTC',theme:'hologram'},quests:[],templates:[],penalties:[],run:null,preferences:preferencesSchema.parse({}),history:Array.from({length:100},(_,i)=>({id:crypto.randomUUID(),role:'user',text:'A'.repeat(2000),at:i})),readiness:{anthropic:false,openai:false}}
    const messages=conversationMessages(ctx,'Hello');expect(messages.reduce((n,m)=>n+m.content.length,0)).toBeLessThanOrEqual(12000);expect(messages[0]!.content).not.toContain('localhost:11434')
  })
})

it('keeps UTF-8 input and state within a small browser model’s context',()=>{
  const ctx:AssistantContext={at:1,awakened:true,hunter:{name:'Hunter',level:1,unspentPoints:0,timezone:'UTC',theme:'hologram'},quests:Array.from({length:50},(_,i)=>({id:String(i),title:'長いタイトル'.repeat(50),status:'ISSUED'})),templates:[],penalties:[],run:null,preferences:preferencesSchema.parse({provider:'webllm'}),history:[],readiness:{anthropic:false,openai:false}}
  const messages=conversationMessages(ctx,'¿Cómo estás? '.repeat(300));const length=messages.reduce((n,m)=>n+new TextEncoder().encode(m.content).length,0)
  expect(length).toBeLessThanOrEqual(4096-900)
})
