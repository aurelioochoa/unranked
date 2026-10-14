'use client'
import { useEffect, useState } from 'react'
import { api } from './client'
import { loadCactus, cactusReady } from './cactus'
import { armPiper, downloadPiperVoice, storedPiperVoices } from '@/voice/piper'
import { PIPER_VOICES } from '@/voice/piperVoices'
import { createVoice } from '@/voice'
import type { AssistantPreferences } from './schema'
export function AssistantSettings({ preferences, onSave, onError }: { preferences: AssistantPreferences; onSave(value: AssistantPreferences): void; onError(message: string): void }) {
  const [prefs, setPrefs] = useState(preferences)
  const [connections, setConnections] = useState<Record<string, string>>({})
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false)
  const [voices, setVoices] = useState<string[]>([])
  useEffect(() => { void storedPiperVoices().then(setVoices).catch(error => onError(error.message)) }, [onError])
  const selected = prefs.providers[prefs.provider]
  const connectionId = `${prefs.provider}:${selected.model}:${selected.endpoint ?? ''}`
  const updateModel = (patch: { model?: string; endpoint?: string }) => setPrefs(prev => ({ ...prev, providers: { ...prev.providers, [prev.provider]: { ...prev.providers[prev.provider], ...patch } } }))
  const work = async (task: () => Promise<void>) => { setBusy(true); try { await task() } catch (error) { onError(error instanceof Error ? error.message : String(error)); setStatus('Unavailable') } finally { setBusy(false) } }
  const downloadVoice = (voiceId: string) => work(async () => { setVoices(await downloadPiperVoice(voiceId, (progress) => setStatus(`Voice download ${Math.round(progress*100)}%`))); setStatus('Voice ready') })
  const preview = (voiceId: string) => { armPiper(); async function* words() { yield voiceId.startsWith('es') ? 'Informe. Estoy listo para ayudarte.' : 'Report. I am ready to assist you.' }; createVoice('local').speak(words(), { voiceId, rate: prefs.rate, volume: prefs.volume, onError }) }
  return <form className="sage-settings stack" onSubmit={event => { event.preventDefault(); void work(async () => { const saved = await api<AssistantPreferences>('preferences', prefs, 'PUT'); onSave(saved); setStatus('Preferences saved') }) }}>
    <label>Name<input className="field" value={prefs.name} maxLength={40} required onChange={e => setPrefs({ ...prefs, name: e.target.value })} /></label>
    <label>Response style<textarea className="field" value={prefs.style} maxLength={600} required onChange={e => setPrefs({ ...prefs, style: e.target.value })} /></label>
    <label>Conversation model<select className="field" value={prefs.provider} onChange={e => { setPrefs({ ...prefs, provider: e.target.value as AssistantPreferences['provider'] }); setStatus('Not tested') }}><option value="ollama">Ollama · free local server</option><option value="webllm">WebLLM · free in this browser</option><option value="anthropic">Claude · optional paid API</option><option value="openai">OpenAI / ChatGPT · optional paid API</option></select></label>
    <label>Model<input className="field" value={selected.model} required onChange={e => updateModel({ model: e.target.value })} /></label>
    {prefs.provider !== 'webllm' && <label>Endpoint<input className="field" value={selected.endpoint ?? ''} placeholder={prefs.provider === 'ollama' ? 'http://localhost:11434' : 'Provider default'} onChange={e => updateModel({ endpoint: e.target.value || undefined })} /></label>}
    {(prefs.provider === 'anthropic' || prefs.provider === 'openai') && <p className="faint">Optional paid service. Set {prefs.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} on the server. ChatGPT subscriptions do not supply an API key. <a href={prefs.provider === 'anthropic' ? 'https://platform.claude.com/docs/en/about-claude/pricing' : 'https://developers.openai.com/api/docs/pricing'} target="_blank" rel="noreferrer">Pricing</a></p>}
    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void work(async () => {
      setConnections(prev => ({ ...prev, [connectionId]: 'Testing…' }))
      try {
      if (prefs.provider === 'webllm') { const { isModelCached, loadEngine } = await import('@/ai/webllm'); if (!(await isModelCached(selected.model))) throw new Error('Download the model first.'); await loadEngine(selected.model) }
      else await api('connection', prefs)
      setStatus('Connection ready')
      setConnections(prev => ({ ...prev, [connectionId]: 'Ready' }))
      } catch (error) { setConnections(prev => ({ ...prev, [connectionId]: 'Unavailable' })); throw error }
    })}>Test connection</button>
    <p role="status" className="faint">Conversation readiness: {connections[connectionId] ?? 'Not tested'}</p>
    {prefs.provider === 'webllm' && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void work(async () => { const { loadEngine } = await import('@/ai/webllm'); await loadEngine(selected.model, p => setStatus(`${Math.round(p.progress*100)}% · ${p.text}`)); setStatus('WebLLM ready') })}>Download conversation model</button>}
    <label>Speech language<select className="field" value={prefs.language} onChange={e => setPrefs({ ...prefs, language: e.target.value as AssistantPreferences['language'] })}><option value="auto">English / Español · detect</option><option value="en">English</option><option value="es">Español</option></select></label>
    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void work(async () => { await loadCactus((progress,label) => setStatus(`${label} · ${Math.round(progress*100)}%`)); setStatus('Needle and Whistle ready') })}>{cactusReady() ? 'Reload speech models' : 'Download speech models · 51 MB'}</button>
    <label className="sage-check"><input type="checkbox" checked={prefs.speak} onChange={e => setPrefs({ ...prefs, speak: e.target.checked })} /> Answer aloud with local Piper</label>
    {(['englishVoice','spanishVoice'] as const).map(key => { const chosen = PIPER_VOICES.find(v => v.id === prefs[key]); return <div className="stack" key={key}>
      <label>{key === 'englishVoice' ? 'English voice' : 'Spanish voice'}<select className="field" value={prefs[key]} onChange={e => setPrefs({ ...prefs, [key]: e.target.value })}>{PIPER_VOICES.filter(v => v.lang.startsWith(key === 'englishVoice' ? 'en' : 'es')).map(v => <option key={v.id} value={v.id}>{v.name} · {v.license}</option>)}</select></label>
      <p className="faint">{chosen?.attribution} <a href={chosen?.source} target="_blank" rel="noreferrer">Model license</a></p>
      <div className="sage-controls"><button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void downloadVoice(prefs[key])}>{voices.includes(prefs[key]) ? 'Downloaded · reload' : 'Download voice'}</button><button type="button" className="btn btn--ghost" disabled={!voices.includes(prefs[key])} onClick={() => preview(prefs[key])}>Preview</button></div>
    </div> })}
    <label>Speed {prefs.rate}%<input type="range" min={50} max={200} value={prefs.rate} onChange={e => setPrefs({ ...prefs, rate: Number(e.target.value) })} /></label>
    <label>Volume {prefs.volume}%<input type="range" min={0} max={100} value={prefs.volume} onChange={e => setPrefs({ ...prefs, volume: Number(e.target.value) })} /></label>
    <p role="status" className="faint">{status || 'Models download only when requested. Audio is processed here and never saved.'}</p>
    <button className="btn" disabled={busy}>Save assistant preferences</button>
  </form>
}
