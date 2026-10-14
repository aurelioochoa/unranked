import { WorkerClient } from './workerClient'
import type { AssistantContext, NeedleResult } from './types'
let client: WorkerClient | null = null
let ready = false
export function cactus() { if (!client || client.closed) { client = new WorkerClient(new Worker('/assistant/cactus.worker.js')); ready = false }; return client }
export const cactusReady = () => ready && !client?.closed
export async function loadCactus(progress: (value: number, label: string) => void) { await cactus().request('load', {}, progress); ready = true }
export function disposeCactus() { client?.dispose(); client = null; ready = false }
// Needle works best with small flat schemas. Server schemas remain the authority.
const string = { type:'string' }; const integer = { type:'integer' }; const boolean = { type:'boolean' }
function tool(name: string, description: string, properties: Record<string, unknown>, required = Object.keys(properties), triggers: string[] = []) {
  return { name, description, parameters:{type:'object',properties,required}, ...(triggers.length ? { triggers } : {}) }
}
export function needleTools() {
  return [
    tool('complete_quest','Mark an existing quest finished. quest is its full title or id.',{quest:string},undefined,['complete quest','completar misión']),
    tool('start_dungeon','Start focused work. Require objective, minutes and track.',{objective:string,minutes:integer,track:{type:'string',enum:['BODY','MIND','DISCIPLINE','INNER','WORK']}},undefined,['start dungeon','iniciar mazmorra']),
    tool('clear_dungeon','Clear the current dungeon after its timer.',{},[],['clear dungeon']),
    tool('flee_dungeon','Leave the current dungeon early; confirmation required.',{},[],['flee','huir']),
    tool('allocate_points','Spend whole ability points; stat is STR,VIT,AGI,INT,PER,CRA.',{stat:{type:'string',enum:['STR','VIT','AGI','INT','PER','CRA']},points:integer},undefined,['allocate','asignar']),
    tool('submit_evidence','Clear a penalty with evidence. penalty is id; note or url must be supplied.',{penalty:string,note:string,url:string},['penalty'],['submit evidence','enviar evidencia']),
    tool('set_setting','Save a requested preference. key is an app field name; value is its new value as text.',{key:string,value:string},undefined,['set','change','cambia']),
    tool('select_daily_quest','Change future daily selections. quest is full title or id; enabled means on, daily means core.',{quest:string,enabled:boolean,daily:boolean},undefined,['daily quest','misión diaria']),
    tool('replay_awakening','Ask the onboarding questions again.',{},[],['replay awakening']),
    tool('rebuild_ledger','Rebuild cached stats from the existing ledger.',{},[],['rebuild ledger']),
    tool('navigate','Open a page; page is status, quests, dungeon, settings or awakening.',{page:{type:'string',enum:['status','quests','dungeon','settings','awakening']}},undefined,['open','abre']),
    tool('fill_form','Prepare fields without saving. form identifies the form. values is JSON text containing only requested fields.',{form:{type:'string',enum:['dungeon','settings','allocation','awakening','evidence']},values:string},undefined,['fill','draft','rellena','prepara']),
  ]
}
export async function needleRoute(text: string, ctx: AssistantContext): Promise<NeedleResult> {
  const result = await cactus().request<NeedleResult>('route', { text, tools: needleTools(), system: `Unranked. English and Spanish commands. Do not guess missing arguments. IDs/titles: ${JSON.stringify({ quests: ctx.quests, templates: ctx.templates, run: ctx.run, penalties: ctx.penalties }).slice(0, 4000)}` })
  if (result.function_calls == null) throw new Error('Needle returned an invalid response. Retry speech models.')
  return { ...result, function_calls: result.function_calls.map((call: any) => ({ name: call.name ?? call.function?.name, arguments: typeof (call.arguments ?? call.function?.arguments) === 'string' ? JSON.parse(call.arguments ?? call.function.arguments) : call.arguments ?? call.function?.arguments ?? {} })) }
}
