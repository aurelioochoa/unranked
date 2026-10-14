'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { BindingContext, type BindingRegistry } from './bindings'
import type { AssistantContext, BatchResult, FormBinding, FormDraft, FormId, FormValues, RouteDecision } from './types'
import { preferencesSchema, type AssistantPreferences, type ConversationMessage, type AppAction } from './schema'
import { api, readEvents } from './client'
import { routeCommand, draftToAction, fromNeedle, isConfirmation, isCancellation } from './router'
import { cactusReady, needleRoute } from './cactus'
import { startMicrophone, type MicrophoneSession } from './microphone'
import { AssistantSettings } from './AssistantSettings'
import { createVoice, type SpeechHandle } from '@/voice'
import { armPiper } from '@/voice/piper'
import { stopAllAudio } from '@/voice/ownership'
import { conversationMessages } from './prompt'
import './assistant.css'
const formPaths: Record<FormId, string> = { dungeon: '/dungeon', settings: '/system', allocation: '/', awakening: '/awaken', evidence: '/quests' }
const blankPrefs = preferencesSchema.parse({})
export function Assistant({ children }: { children: ReactNode }) {
  const router = useRouter(); const path = usePathname()
  const [open, setOpen] = useState(false); const [settings, setSettings] = useState(false)
  const [context, setContext] = useState<AssistantContext | null>(null)
  const [prefs, setPrefs] = useState(blankPrefs); const prefsRef = useRef(prefs); prefsRef.current = prefs
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [input, setInput] = useState(''); const [transcript, setTranscript] = useState('')
  const [state, setState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle')
  const [error, setError] = useState(''); const [listening, setListening] = useState(false); const [handsFree, setHandsFree] = useState(false)
  const [pending, setPending] = useState<BatchResult | null>(null)
  const pendingRef = useRef(pending); pendingRef.current = pending
  const [draft, setDraft] = useState<FormDraft | null>(null); const draftRef = useRef<FormDraft | null>(null)
  const [retry, setRetry] = useState<{ requestId: string; actions: AppAction[]; prior?: BatchResult } | null>(null)
  const bindings = useRef(new Map<FormId, Map<string, FormBinding>>())
  const generation = useRef<AbortController | null>(null); const handle = useRef<SpeechHandle | null>(null)
  const microphone = useRef<MicrophoneSession | null>(null); const listeningRef = useRef(false)
  const logRef = useRef<HTMLDivElement>(null); const followLog = useRef(true); const launchRef = useRef<HTMLButtonElement>(null)
  const busy = useRef(false); const epoch = useRef(0); const inputRef = useRef<HTMLInputElement>(null)
  const clarification = useRef<string | null>(null)
  const applying = useRef<FormDraft | null>(null)
  useEffect(() => { if (followLog.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [messages])
  const registry = useMemo<BindingRegistry>(() => ({
    register(binding) {
      const group = bindings.current.get(binding.id) ?? new Map<string, FormBinding>()
      const key = binding.recordId ?? ''; group.set(key, binding as FormBinding); bindings.current.set(binding.id, group)
      return () => { if (group.get(key) === binding) group.delete(key); if (!group.size) bindings.current.delete(binding.id) }
    },
    get(id, recordId) { const group = bindings.current.get(id); return recordId ? group?.get(recordId) : group?.size === 1 ? [...group.values()][0] : undefined },
  }), [])
  const showError = useCallback((message: string) => setError(message), [])
  const reload = useCallback(async () => { const current = await api<AssistantContext>('context', undefined, 'GET'); setContext(current); setPrefs(current.preferences); setMessages(current.history); return current }, [])
  useEffect(() => { void reload().catch(e => setError(e.message)) }, [reload])
  const interrupt = useCallback(() => {
    epoch.current++; generation.current?.abort(); handle.current?.stop(); stopAllAudio(); busy.current = false
    setState(listeningRef.current ? 'listening' : 'idle')
  }, [])
  const stopListening = useCallback(async () => {
    listeningRef.current = false; setListening(false); setHandsFree(false)
    const mic = microphone.current; microphone.current = null
    if (mic) { try { await mic.stop() } catch (e) { showError(e instanceof Error ? e.message : String(e)) } }
    setState('idle')
  }, [showError])
  useEffect(() => {
    const hidden = () => { if (document.hidden) { interrupt(); void stopListening() } }
    document.addEventListener('visibilitychange', hidden)
    return () => { document.removeEventListener('visibilitychange', hidden); interrupt(); void stopListening() }
  }, [interrupt, stopListening])
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); launchRef.current?.focus(); interrupt(); void stopListening() } }
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key)
  }, [open, interrupt, stopListening])
  useEffect(() => {
    if (!applying.current) return
    let tries = 0
    const timer = setInterval(() => {
      const value = applying.current; if (!value) { clearInterval(timer); return }
      const binding = registry.get(value.form, value.form === 'evidence' ? value.values.penaltyId : undefined)
      if (binding) { binding.fill(value.values); applying.current = null; clearInterval(timer) }
      else if (++tries > 40) { setError('The form is not available on this page. Open its page and try again.'); applying.current = null; clearInterval(timer) }
    }, 100)
    return () => clearInterval(timer)
  }, [path, draft, registry])
  const addMessage = async (role: ConversationMessage['role'], text: string, persist = true) => {
    const message = { id: crypto.randomUUID(), role, text: text.slice(0,16000), at: Date.now() }
    setMessages(prev => [...prev, message].slice(-100))
    if (persist) await api('history', message)
    return message
  }
  const speak = async (source: AsyncIterable<string>, token: number, language: string = prefsRef.current.language, render?: (piece: string) => void) => {
    const p = prefsRef.current
    const voice = createVoice(p.speak ? 'local' : 'none')
    async function* guarded() { for await (const piece of source) { if (token !== epoch.current) return; render?.(piece); yield piece } }
    if (p.speak) setState('speaking')
    const speech = voice.speak(guarded(), { voiceId: language === 'es' ? p.spanishVoice : p.englishVoice, rate: p.rate, volume: p.volume, onStop: () => generation.current?.abort(), onError: showError })
    handle.current = speech; await speech.done
    if (token === epoch.current) setState(listeningRef.current ? 'listening' : 'idle')
  }
  const say = async (text: string, token: number, language: string) => { if (token !== epoch.current) return; await addMessage('assistant', text); async function* source() { yield text }; await speak(source(), token, language) }
  const runBatch = async (actions: AppAction[], token: number, language: string, prior?: BatchResult, requestId = crypto.randomUUID()) => {
    if (token !== epoch.current) return
    let result: BatchResult
    const id = prior?.requestId ?? requestId
    const allActions = prior?.confirmation?.actions ?? actions
    if (allActions.some(action => action.type === 'awaken')) registry.get('awakening')?.fill({ step: 5 } as Partial<FormValues['awakening']>)
    try {
      // Mutations continue independently of generation cancellation, so their receipts are never lost.
      result = await api<BatchResult>('actions', { requestId: id, actions: allActions, ...(prior?.confirmation ? { confirmation: prior.confirmation.token } : {}) })
      setRetry(null)
    } catch (e) { setRetry({ requestId: id, actions: allActions, prior }); throw e }
    setPending(result.status === 'confirmation' ? result : null)
    router.refresh()
    if (result.status === 'done') { draftRef.current = null; setDraft(null) }
    if (actions.some(a => a.type === 'settings') && result.status === 'done') {
      const current = await api<AssistantContext>('context', undefined, 'GET'); setContext(current); document.documentElement.dataset.theme = current.hunter.theme
    }
    if (actions.some(a => a.type === 'awaken') && result.status === 'done') router.push('/')
    if (actions.some(a => a.type === 'replayAwakening') && result.status === 'done') router.push('/awaken')
    const previousCount = prior?.results.length ?? 0
    const text = result.results.slice(previousCount).map(r => r.ok ? language === 'es' ? `Acción ${r.type} completada.` : r.message : r.message).join(' ')
    if (text) await say(text, token, language)
    if (result.confirmation) await say(result.confirmation.prompt, token, language)
  }
  const activeForm = (): FormDraft | undefined => {
    const form: FormId | undefined = path === '/awaken' ? 'awakening' : path === '/system' ? 'settings' : path === '/dungeon' ? 'dungeon' : draftRef.current?.form
    const binding = form && registry.get(form, form === 'evidence' && draftRef.current?.form === 'evidence' ? draftRef.current.values.penaltyId : undefined)
    return binding && form ? { form, values: binding.read() } as FormDraft : draftRef.current ?? undefined
  }
  const applyDraft = (value: FormDraft) => {
    const current = registry.get(value.form, value.form === 'evidence' ? value.values.penaltyId : undefined)
    const merged = { form: value.form, values: { ...(current?.read() ?? (draftRef.current?.form === value.form ? draftRef.current.values : {})), ...value.values } } as FormDraft
    draftRef.current = merged; setDraft(merged)
    if (current) current.fill(value.values)
    else { applying.current = value; router.push(formPaths[value.form]) }
  }
  const turnRef = useRef<(text: string) => Promise<void>>(async () => {})
  const turn = async (text: string) => {
    if (!text.trim() || busy.current) return
    followLog.current = true
    interrupt(); busy.current = true; const token = epoch.current; setError(''); setState('thinking'); setInput('')
    const language = prefsRef.current.language === 'auto' ? /[áéíóúñ¿¡]|\b(el|la|mi|mis|una|quiero|iniciar|rellena|prepara|completar|huir|guardar|asignar|cambia|si)\b/i.test(text) ? 'es' : 'en' : prefsRef.current.language
    try {
      const ctx = await api<AssistantContext>('context', undefined, 'GET'); setContext(ctx)
      const user = await addMessage('user', text, false)
      if (pendingRef.current) {
        await api('history', user)
        if (isConfirmation(text)) await runBatch(pendingRef.current.confirmation!.actions, token, language, pendingRef.current)
        else if (isCancellation(text)) { await api('actions', { requestId: pendingRef.current.requestId }, 'DELETE'); setPending(null); await say(language === 'es' ? 'Cancelado.' : 'Cancelled.', token, language) }
        else await say(language === 'es' ? 'Confirma o cancela la acción pendiente.' : 'Confirm or cancel the pending action first.', token, language)
        return
      }
      if (isCancellation(text)) { await api('history', user); await addMessage('assistant', language === 'es' ? 'Detenido.' : 'Stopped.'); return }
      let decision: RouteDecision | null = routeCommand(text, ctx, activeForm())
      if (!decision) {
        const parts = text.split(/\s+(?:and then|then|y luego|luego)\s+/i)
        if (parts.length > 1) {
          const steps = parts.map(part => routeCommand(part, ctx, activeForm()))
          if (steps.every(step => step?.actions)) decision = { actions: steps.flatMap(step => step!.actions!) }
        }
      }
      if (!decision && clarification.current) {
        const prior = clarification.current
        if (/^(complete|finish|completar|terminar|completa)/i.test(prior)) decision = routeCommand(`complete quest ${text}`, ctx, activeForm())
        else if (/^(enable|disable|make daily|make rotating|activar|desactivar|hacer)/i.test(prior)) decision = routeCommand(`${prior.split(/\s+/).slice(0,prior.startsWith('make') || prior.startsWith('hacer') ? 2 : 1).join(' ')} ${text}`, ctx, activeForm())
        else if (/^(submit evidence|resolve penalty|enviar evidencia|resolver penalidad)/i.test(prior)) decision = routeCommand(`submit evidence ${text}`, ctx, activeForm())
      }
      if (!decision && cactusReady()) decision = fromNeedle(await needleRoute(text, ctx), ctx)
      if (!decision && draftRef.current?.form === 'dungeon' && /\b\d+\s*(?:minutes?|minutos?)\b/i.test(text)) decision = routeCommand(`start dungeon ${text}`, ctx, draftRef.current)
      if (token !== epoch.current) return
      if (decision) {
        await api('history', user)
        if (decision.draft) { applyDraft(decision.draft); await say(language === 'es' ? 'Borrador preparado. Puedes editarlo y decir guardar o iniciar.' : 'Draft prepared. Review the fields, then say save or start.', token, language) }
        if (decision.navigate) { router.push(decision.navigate); await say(language === 'es' ? 'Abriendo la página.' : 'Opening the page.', token, language) }
        if (decision.actions) await runBatch(decision.actions, token, language)
        clarification.current = decision.clarification ? text : null
        if (decision.clarification) await say(decision.clarification, token, language)
        return
      }
      // General conversation can explain app state but cannot manufacture mutation results.
      const controller = new AbortController(); generation.current = controller
      const answerId = crypto.randomUUID(); let answer = ''
      setMessages(prev => [...prev, { id: answerId, role: 'assistant', text: '', at: Date.now() }])
      const render = (piece: string) => { answer += piece; setMessages(prev => prev.map(m => m.id === answerId ? { ...m, text: answer } : m)) }
      let source: AsyncIterable<string>
      if (prefsRef.current.provider === 'webllm') {
        await api('history', user)
        const { streamWebLlmConversation, webLlmContextWindow } = await import('@/ai/webllm')
        source = streamWebLlmConversation(prefsRef.current.providers.webllm.model, conversationMessages(ctx,text, await webLlmContextWindow(prefsRef.current.providers.webllm.model)), controller.signal)
      } else {
        const response = await fetch('/api/assistant/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ id: user.id, text }) })
        source = (async function* () { for await (const event of readEvents(response)) { if (event.type === 'text') yield event.text; else if (event.type === 'error') throw new Error(event.message) } })()
      }
      async function* checked() { try { yield* source } catch (e) { if (!controller.signal.aborted) showError(e instanceof Error ? e.message : String(e)) } }
      await speak(checked(), token, language, render)
      if (prefsRef.current.provider === 'webllm' && answer.trim()) await api('history', { id: answerId, role: 'assistant', text: answer.slice(0,16000), at: Date.now() })
    } catch (error) { if (token === epoch.current) showError(error instanceof Error ? error.message : String(error)) }
    finally { if (token === epoch.current) { busy.current = false; setState(listeningRef.current ? 'listening' : 'idle') } }
  }
  turnRef.current = turn
  const listen = async (continuous: boolean) => {
    if (listeningRef.current) { await stopListening(); return }
    armPiper(); interrupt(); setError(''); listeningRef.current = true; setListening(true); setHandsFree(continuous); setState('listening')
    try {
      const mic = await startMicrophone({ language: prefsRef.current.language, keywords: ['ajustes','mazmorra','misiones','despertar', ...context?.quests.map(q => q.title) ?? []], continuous,
        onPartial: setTranscript, onSpeech: interrupt,
        onFinal: text => { if (!continuous) { listeningRef.current = false; setListening(false); microphone.current = null }; void turnRef.current(text) },
        onError: error => { showError(error.message); void stopListening() },
      })
      if (!listeningRef.current) await mic.stop(); else microphone.current = mic
    } catch (error) { showError(error instanceof Error ? error.message : String(error)); listeningRef.current = false; setListening(false); setHandsFree(false); setState('idle') }
  }
  const savePrefs = (value: AssistantPreferences) => { setPrefs(value); setSettings(false) }
  return <BindingContext.Provider value={registry}>
    {children}
    <button ref={launchRef} className="sage-launch" type="button" aria-expanded={open} aria-controls="sage-panel" onClick={() => { setOpen(prev => !prev); if (open) { interrupt(); void stopListening() } }}><span aria-hidden="true">◇</span> {prefs.name}</button>
    {open && <aside id="sage-panel" className="sage-panel" aria-label={`${prefs.name} assistant`}>
      <header className="sage-header"><div><strong>{prefs.name}</strong><span role="status" className="sage-state">{state} · {prefs.provider}{handsFree ? ' · hands-free' : ''}</span></div><div className="sage-controls"><button type="button" className="btn btn--ghost" aria-label="Assistant settings" onClick={() => setSettings(prev => !prev)}>Settings</button><button type="button" className="btn btn--ghost" aria-label="Close assistant" onClick={() => { setOpen(false); launchRef.current?.focus(); interrupt(); void stopListening() }}>×</button></div></header>
      {settings ? <AssistantSettings preferences={prefs} onSave={savePrefs} onError={showError} /> : <>
        <div ref={logRef} className="sage-history" onScroll={event => { const log = event.currentTarget; followLog.current = log.scrollHeight - log.scrollTop - log.clientHeight < 60 }} role="log" aria-live="polite" aria-relevant="additions text">
          {!messages.length && <p className="faint">Report. I can prepare forms, complete quests, and explain your status. Puedes hablar o escribir en español. Open Settings to download local speech models.</p>}
          {messages.map(message => <p key={message.id} className={`sage-message sage-message--${message.role}`}><span>{message.role === 'user' ? 'You' : prefs.name}</span>{message.text || 'Thinking…'}</p>)}
        </div>
        {draft && <div className="sage-draft"><span className="label">Prepared · {draft.form}</span><pre>{JSON.stringify(draft.values,null,2)}</pre><p className="faint">The page fields show this draft. Review them before submitting.</p></div>}
        {pending?.confirmation && <div className="sage-confirm" role="alert"><p>{pending.confirmation.prompt}</p><pre>{JSON.stringify(pending.confirmation.actions,null,2)}</pre><div className="sage-controls"><button className="btn" type="button" onClick={() => void turn('confirm')}>Confirm</button><button className="btn btn--ghost" type="button" onClick={() => void turn('cancel')}>Cancel</button></div></div>}
        {retry && <button type="button" className="btn btn--ghost" onClick={() => { const token = epoch.current; void runBatch(retry.actions, token, prefs.language, retry.prior, retry.requestId).catch(e => showError(e.message)) }}>Check / retry last action</button>}
        {transcript && <p className="sage-transcript" aria-live="polite">{transcript}</p>}
        <form className="sage-input" onSubmit={event => { event.preventDefault(); armPiper(); void turn(input) }}><label className="sr-only" htmlFor="sage-command">Message to {prefs.name}</label><input ref={inputRef} id="sage-command" className="field" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask or give a command…" maxLength={4000} autoComplete="off" /><button className="btn" disabled={!input.trim() || state === 'thinking'}>Send</button></form>
        <div className="sage-controls sage-mic"><button type="button" className="btn btn--ghost" aria-pressed={listening && !handsFree} onClick={() => void listen(false)}>{listening && !handsFree ? 'Stop microphone' : 'Tap to talk'}</button><button type="button" className="btn btn--ghost" aria-pressed={handsFree} onClick={() => void listen(true)}>{handsFree ? 'End conversation' : 'Start hands-free'}</button><button type="button" className="btn btn--ghost" onClick={interrupt}>Interrupt</button></div>
        <footer className="sage-footer"><span>Local text history · audio never saved</span><button type="button" onClick={() => { interrupt(); void api('history', undefined, 'DELETE').then(() => setMessages([])).catch(e => showError(e.message)) }}>Clear history</button></footer>
      </>}
      {error && <div className="sage-error" role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
    </aside>}
  </BindingContext.Provider>
}
