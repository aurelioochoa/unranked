import { actionSchema, settingsSchema, type AppAction } from './schema'
import type { AssistantContext, FormDraft, FormId, FormValues, NeedleResult, RouteDecision } from './types'
import { STATS } from '@/domain/types'
export const normalize = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[“”"']/g, '').trim().replace(/^[¿¡]+|[.!?]+$/g, '').trim()
export function resolveReference(value: string, rows: { id: string; title: string }[]): string | null {
  const n = normalize(value)
  const exact = rows.filter(r => r.id === value || normalize(r.title) === n)
  if (exact.length === 1) return exact[0]!.id
  if (exact.length > 1 || n.length < 3) return null
  const matches = rows.filter(r => normalize(r.title).includes(n) || n.includes(normalize(r.title)))
  return matches.length === 1 ? matches[0]!.id : null
}
export const isConfirmation = (v: string) => /^(yes|confirm|confirmar|si|acepto|accept|do it|hazlo)[.! ]*$/.test(normalize(v))
export const isCancellation = (v: string) => /^(no|cancel|cancelar|stop|detente)[.! ]*$/.test(normalize(v))
const tracks: Record<string, FormValues['dungeon']['track']> = { body: 'BODY', cuerpo: 'BODY', mind: 'MIND', mente: 'MIND', discipline: 'DISCIPLINE', disciplina: 'DISCIPLINE', inner: 'INNER', interior: 'INNER', work: 'WORK', trabajo: 'WORK' }
const statNames: Record<string, typeof STATS[number]> = { strength: 'STR', fuerza: 'STR', vitality: 'VIT', vitalidad: 'VIT', agility: 'AGI', agilidad: 'AGI', intelligence: 'INT', inteligencia: 'INT', perception: 'PER', percepcion: 'PER', craft: 'CRA', oficio: 'CRA' }
export function draftToAction(draft: FormDraft): AppAction {
  switch (draft.form) {
    case 'dungeon': return actionSchema.parse({ type: 'startDungeon', ...draft.values })
    case 'settings': return actionSchema.parse({ type: 'settings', patch: draft.values })
    case 'allocation': return actionSchema.parse({ type: 'allocate', spend: draft.values })
    case 'awakening': { const { step: _, ...answers } = draft.values; return actionSchema.parse({ type: 'awaken', answers }) }
    case 'evidence': return actionSchema.parse({ type: 'resolvePenalty', ...draft.values })
  }
}
/** Conservative offline command grammar. Unrecognised text goes to Needle/conversation, never guessed mutations. */
export function routeCommand(input: string, ctx: AssistantContext, current?: FormDraft): RouteDecision | null {
  const text = normalize(input)
  if (/^(save|guardar|start|iniciar|submit|enviar|accept awakening|aceptar despertar)[.! ]*$/.test(text) && current) {
    try { return { actions: [draftToAction(current)] } } catch { return { clarification: 'The form needs more details. / Faltan datos en el formulario.' } }
  }
  const nav = text.match(/^(?:go to|open|navigate to|ir a|abre|abrir|ve a) (?:the |el |la )?(dashboard|status|inicio|estado|quests|misiones|dungeon|mazmorra|settings|system|ajustes|configuracion|awakening|despertar)$/)
  if (nav) return { navigate: ({ dashboard: '/', status: '/', inicio: '/', estado: '/', quests: '/quests', misiones: '/quests', dungeon: '/dungeon', mazmorra: '/dungeon', settings: '/system', system: '/system', ajustes: '/system', configuracion: '/system', awakening: '/awaken', despertar: '/awaken' } as Record<string, RouteDecision['navigate']>)[nav[1]!] }
  if (/^(rebuild (?:the )?ledger|reconstruir (?:el )?registro)$/.test(text)) return { actions: [{ type: 'rebuildLedger' }] }
  if (/^(replay awakening|repetir despertar)$/.test(text)) return { actions: [{ type: 'replayAwakening' }] }
  if (/^(clear (?:the )?dungeon|completar (?:la )?mazmorra)$/.test(text)) return ctx.run ? { actions: [{ type: 'clearDungeon', runId: ctx.run.id }] } : { clarification: 'There is no open dungeon. / No hay una mazmorra abierta.' }
  if (/^(flee(?: (?:the )?dungeon)?|huir(?: (?:de la )?mazmorra)?)$/.test(text)) return ctx.run ? { actions: [{ type: 'fleeDungeon', runId: ctx.run.id }] } : { clarification: 'There is no open dungeon. / No hay una mazmorra abierta.' }
  const complete = input.match(/^(?:complete|finish|mark complete|completar|terminar|completa)\s+(?:(?:the )?quest |(?:la )?mision )?(.+?)[.!]?$/i)
  if (complete) {
    const id = resolveReference(complete[1]!, ctx.quests)
    return id ? { actions: [{ type: 'completeQuest', questId: id }] } : { clarification: 'Which quest? Say its full title. / ¿Qué misión? Di el título completo.' }
  }
  if (/^(next step|continue|siguiente|continuar)$/.test(text) && current?.form === 'awakening') return { draft: { form: 'awakening', values: { step: Math.min(5, Number(current.values.step ?? 0) + 1) } } }
  const selection = input.match(/^(enable|disable|make daily|make rotating|activar|desactivar|hacer diaria|hacer rotativa)\s+(?:(?:the )?quest |(?:la )?mision )?(.+)$/i)
  if (selection) {
    const id = resolveReference(selection[2]!,ctx.templates)
    if (!id) return { clarification: 'Which quest template? Say its full title. / ¿Qué misión? Di el título completo.' }
    const verb = normalize(selection[1]!); const isCore = ['make daily','hacer diaria'].includes(verb)
    if (current?.form === 'awakening') {
      const core = new Set(current.values.core ?? []); const enabled = new Set(current.values.enabled ?? [])
      if (['disable','desactivar'].includes(verb)) { core.delete(id); enabled.delete(id) }
      else { enabled.add(id); if (isCore) core.add(id); else if (['make rotating','hacer rotativa'].includes(verb)) core.delete(id) }
      return { draft: { form: 'awakening', values: { core:[...core], enabled:[...enabled] } } }
    }
    return { actions: [{ type:'template', templateId:id, ...(['enable','activar','disable','desactivar'].includes(verb) ? { enabled: ['enable','activar'].includes(verb) } : { enabled:true,isCore }) }] }
  }
  const proof = input.match(/^(submit evidence|submit proof|resolve penalty|enviar evidencia|resolver penalidad)\s*:?\s*(.*)$/i)
  if (proof) {
    const id = current?.form === 'evidence' ? current.values.penaltyId : ctx.penalties.length === 1 ? ctx.penalties[0]!.id : null
    if (!id) return { clarification:'Which penalty? Open its evidence form first. / ¿Qué penalidad? Abre su formulario de evidencia.' }
    const detail=proof[2]!.trim(); const url=detail.match(/https?:\/\/\S+/)?.[0] ?? ''; const note=detail.replace(url,'').trim()
    if (!note && !url) return { draft:{form:'evidence',values:{penaltyId:id}}, clarification:'Describe what you did and when, or give an evidence URL. / Describe qué hiciste y cuándo, o comparte una URL.' }
    return { actions:[{type:'resolvePenalty',penaltyId:id,note,url}] }
  }
  if (/^(?:fill this|fill form|rellena esto|llenar formulario)\s*:/i.test(input) && current) {
    try {
      const values=JSON.parse(input.slice(input.indexOf(':')+1)); const draft={form:current.form,values:{...current.values,...values}} as FormDraft
      draftToAction(draft) // Only valid fields enter React form bindings.
      return { draft:{form:current.form,values} as FormDraft }
    } catch { return { clarification:'Provide valid JSON form fields. / Proporciona campos JSON válidos.' } }
  }
  const allocate = text.match(/^(?:(?:fill|draft|prepara|rellena) )?(?:allocate|spend|assign|asignar|asigna|gastar) (\d+) (?:points? |puntos? )?(?:to |a |en )?(\w+)$/)
  if (allocate) {
    const stat = statNames[allocate[2]!] ?? STATS.find(s => s.toLowerCase() === allocate[2])
    if (stat) { const spend = { [stat]: Number(allocate[1]) }; return /^(fill|draft|prepara|rellena) /.test(text) ? { draft:{form:'allocation',values:spend} } : { actions: [{ type: 'allocate', spend }] } }
  }
  const setting = input.match(/^(?:(fill|draft|rellena|llenar|prepara)\s+)?(?:set|change|cambia|cambiar|pon|establecer)\s+(?:my |mi |el |la )?(name|nombre|theme|tema|timezone|zona horaria|difficulty|dificultad|volume|volumen|background|fondo|reset hour|hora de reinicio|rotating quests|misiones rotativas|voice rate|velocidad|voice pitch|tono|voice policy|politica de voz|voice adapter|motor de voz|voice|voz|ai provider|proveedor|ai model|modelo|ai endpoint|endpoint|answer budget|presupuesto)\s+(?:to |a |en )?(.+)$/i)
  if (setting) {
    const field = ({ name: 'name', nombre: 'name', theme: 'theme', tema: 'theme', timezone: 'timezone', 'zona horaria': 'timezone', difficulty: 'difficulty', dificultad: 'difficulty', volume: 'voiceVolume', volumen: 'voiceVolume', background: 'background', fondo: 'background', 'reset hour': 'dailyResetHour', 'hora de reinicio': 'dailyResetHour', 'rotating quests': 'rotatingQuestCount', 'misiones rotativas': 'rotatingQuestCount', 'voice rate': 'voiceRate', velocidad: 'voiceRate', 'voice pitch': 'voicePitch', tono: 'voicePitch', 'voice policy': 'voicePolicy', 'politica de voz': 'voicePolicy', 'voice adapter': 'voiceAdapter', 'motor de voz': 'voiceAdapter', voice: 'voiceId', voz: 'voiceId', 'ai provider': 'aiProvider', proveedor: 'aiProvider', 'ai model': 'aiModel', modelo: 'aiModel', 'ai endpoint': 'aiBaseUrl', endpoint: 'aiBaseUrl', 'answer budget': 'aiMaxOutputTokens', presupuesto: 'aiMaxOutputTokens' } as Record<string, string>)[normalize(setting[2]!)]!
    let value: string | number = setting[3]!.trim().replace(/[.!]$/, '')
    if (field === 'difficulty' || field === 'voicePolicy') value = value.toUpperCase()
    if (field === 'theme') value = value.toLowerCase()
    if (['voiceVolume','voiceRate','voicePitch','dailyResetHour','rotatingQuestCount','aiMaxOutputTokens'].includes(field)) value = Number(value.replace('%',''))
    const parsed = settingsSchema.safeParse({ [field]: value })
    if (!parsed.success) return { clarification: parsed.error.issues.map(i => i.message).join('; ') }
    if (setting[1] || current?.form === 'awakening') return { draft: { form: current?.form === 'awakening' ? 'awakening' : 'settings', values: parsed.data } }
    return { actions: [{ type: 'settings', patch: parsed.data }] }
  }
  const dungeon = text.match(/^(fill|draft|prepare|start|iniciar|inicia|rellena|prepara) (?:a |the |una |la )?(?:dungeon|mazmorra)(?:\s*:?\s*(.*))$/)
  if (dungeon) {
    const raw = dungeon[2] ?? ''
    const duration = raw.match(/(\d+)\s*(?:minutes?|minutos?|min)\b/)
    const track = Object.entries(tracks).find(([name]) => new RegExp(`\\b${name}\\b`).test(raw))?.[1]
    const objective = input.replace(/^\S+\s+(?:a |the |una |la )?(?:dungeon|mazmorra)\s*:?\s*/i, '').replace(/\b(?:for |por |durante )?\d+\s*(?:minutes?|minutos?|min)\b/ig, '').replace(/\b(?:track|in|en|categoria)?\s*(?:body|cuerpo|mind|mente|discipline|disciplina|inner|interior|work|trabajo)\b/ig, '').trim().replace(/[,;]$/, '').trim()
    const values = { ...(current?.form === 'dungeon' ? current.values : {}), ...(objective ? { objective } : {}), ...(duration ? { minutes: Number(duration[1]) } : {}), ...(track ? { track } : {}) }
    const draft: FormDraft = { form: 'dungeon', values }
    if (['fill','draft','prepare','rellena','prepara'].includes(dungeon[1]!)) return { draft }
    try { return { actions: [draftToAction(draft)] } } catch { return { draft, clarification: 'Give an objective, minutes and track (body, mind, discipline, inner or work). / Indica objetivo, minutos y categoría.' } }
  }
  return null
}
export function fromNeedle(result: NeedleResult, ctx: AssistantContext): RouteDecision | null {
  if (!result.function_calls.length) return result.suppressed_calls?.length ? { clarification: 'Please state the action and its fields explicitly. / Indica la acción y sus campos explícitamente.' } : null
  if (!Number.isFinite(result.confidence) || result.confidence < 0.85) return { clarification: 'Please make the command more specific. / Especifica la acción y sus datos.' }
  const actions: AppAction[] = []
  for (const original of result.function_calls) {
    const call = { ...original }
    let args = { ...call.arguments }
    const names: Record<string,string> = { complete_quest:'completeQuest',start_dungeon:'startDungeon',clear_dungeon:'clearDungeon',flee_dungeon:'fleeDungeon',allocate_points:'allocate',submit_evidence:'resolvePenalty',set_setting:'settings',select_daily_quest:'template',replay_awakening:'replayAwakening',rebuild_ledger:'rebuildLedger' }
    if (call.name === 'complete_quest') args = { questId:args.quest }
    if (call.name === 'clear_dungeon' || call.name === 'flee_dungeon') args = { runId:'current' }
    if (call.name === 'allocate_points') args = { spend:{[String(args.stat)]:args.points} }
    if (call.name === 'submit_evidence') args = { penaltyId:args.penalty,note:args.note ?? '',url:args.url ?? '' }
    if (call.name === 'set_setting') args = { patch:{[String(args.key)]:args.key === 'aiThinking' ? ['true','on','yes'].includes(String(args.value)) : args.value} }
    if (call.name === 'select_daily_quest') args = { templateId:args.quest,enabled:args.enabled,isCore:args.daily }
    call.name = names[call.name] ?? call.name
    if (call.name === 'navigate') {
      if (result.function_calls.length !== 1) return { clarification: 'Give navigation separately from other actions. / Indica la navegación por separado.' }
      const path = args.path ?? ({status:'/',quests:'/quests',dungeon:'/dungeon',settings:'/system',awakening:'/awaken'} as Record<string,string>)[String(args.page)]
      if (['/','/quests','/dungeon','/system','/awaken'].includes(String(path))) return { navigate: path as RouteDecision['navigate'] }
    }
    if (call.name === 'fill_form') {
      if (result.function_calls.length !== 1) return { clarification: 'Fill one form at a time. / Rellena un formulario a la vez.' }
      try {
        const form = String(args.form) as FormId
        const values = typeof args.values === 'string' ? JSON.parse(args.values) : args.values
        if (form === 'settings' || form === 'awakening') return { draft: { form, values: settingsSchema.partial().parse(values) } }
        const actionType = { dungeon: 'startDungeon', allocation: 'allocate', evidence: 'resolvePenalty' }[form as 'dungeon' | 'allocation' | 'evidence']
        const action = actionSchema.parse(form === 'allocation' ? { type: actionType, spend: values } : { type: actionType, ...values })
        const { type: _, ...rest } = action
        return { draft: { form, values: form === 'allocation' && action.type === 'allocate' ? action.spend : rest } as FormDraft }
      } catch { return { clarification: 'Please specify valid form fields. / Indica campos válidos.' } }
    }
    if (call.name === 'completeQuest') args.questId = resolveReference(String(args.questId), ctx.quests)
    if (call.name === 'template') args.templateId = resolveReference(String(args.templateId), ctx.templates)
    if ((call.name === 'clearDungeon' || call.name === 'fleeDungeon') && args.runId === 'current') args.runId = ctx.run?.id
    try { actions.push(actionSchema.parse({ ...args, type: call.name })) } catch { return { clarification: `Missing or ambiguous details for ${call.name}. / Faltan datos o son ambiguos.` } }
  }
  return actions.length ? { actions } : null
}
