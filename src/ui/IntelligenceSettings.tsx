'use client'

import { useFormFieldEffect, BoundInput } from '@/assistant/bindings'

import { useEffect, useState } from 'react'
import { AI_PROVIDERS, DEFAULT_MODELS, type AiProvider } from '@/ai/config'
import type { WebLlmModelOption, WebLlmProgress } from '@/ai/webllm'

const PROVIDER_LABELS: Record<AiProvider, string> = {
  none: 'none — the System speaks from its own script',
  webllm: 'in this browser (WebGPU, no server, offline)',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  ollama: 'Ollama (local)',
  'openai-compatible': 'any OpenAI-compatible endpoint',
}

/** Providers that reach a third party over the network with your data. */
const REMOTE: ReadonlySet<AiProvider> = new Set(['anthropic', 'openai', 'google'])

function gb(mb: number | undefined): string {
  if (!mb) return '—'
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB VRAM` : `${mb} MB VRAM`
}

export function IntelligenceSettings({
  provider: initialProvider,
  model,
  baseUrl,
  webllmModel,
  thinking,
  maxOutputTokens,
  reasoningTokens,
  thinkingTimeoutMs,
  apiKeyPresent,
}: {
  provider: AiProvider
  model: string
  baseUrl: string
  webllmModel: string
  thinking: boolean
  maxOutputTokens: number
  reasoningTokens: number
  thinkingTimeoutMs: number
  /** Whether a server API key is set. The key itself never reaches the browser. */
  apiKeyPresent: boolean
}) {
  const [provider, setProvider] = useState<AiProvider>(initialProvider)
  const [thinks, setThinks] = useState(thinking)
  const [chosenWebllm, setChosenWebllm] = useState(webllmModel)

  const [models, setModels] = useState<WebLlmModelOption[] | null>(null)
  const [gpu, setGpu] = useState<boolean | null>(null)
  const [cached, setCached] = useState<boolean | null>(null)
  const [progress, setProgress] = useState<WebLlmProgress | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useFormFieldEffect('aiProvider', v => setProvider(String(v) as AiProvider))
  useFormFieldEffect('webllmModel', v => setChosenWebllm(String(v)))
  useFormFieldEffect('aiThinking', v => setThinks(v === true || v === "on"))

  const isBrowser = provider === 'webllm'
  const isRemote = REMOTE.has(provider)
  const needsBaseUrl = provider === 'openai-compatible'
  const isLocalEngine = provider === 'ollama' || isBrowser

  useEffect(() => {
    if (!isBrowser) return
    let cancelled = false
    void (async () => {
      const mod = await import('@/ai/webllm')
      if (cancelled) return
      setGpu(mod.webGpuAvailable())
      setModels(await mod.listWebLlmModels())
      setCached(await mod.isModelCached(chosenWebllm))
    })()

    return () => {
      cancelled = true
    }
  }, [isBrowser, chosenWebllm])

  const preload = async () => {
    setLoadError(null)
    setProgress({ progress: 0, text: 'starting' })
    try {
      const { loadEngine } = await import('@/ai/webllm')
      await loadEngine(chosenWebllm, setProgress)
      setCached(true)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setProgress(null)
    }
  }

  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2 className="label">Intelligence</h2>

      <div className="row">
        <label style={{ fontSize: 13 }} htmlFor="aiProvider">Provider</label>
        <select
          id="aiProvider"
          name="aiProvider"
          className="field"
          style={{ maxWidth: 280, minHeight: 36 }}
          value={provider}
          onChange={(e) => setProvider(e.target.value as AiProvider)}
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {/* Where the data goes matters more than any other setting on this page. */}
      <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, paddingLeft: 11, borderLeft: '2px solid var(--color-panel-border)' }}>
        {provider === 'none' &&
          'No model. The System still speaks, from lines written into the app. Nothing leaves this machine.'}
        {isBrowser &&
          'The model runs on your GPU, in this tab. Nothing leaves this machine, and it works offline once the weights are cached.'}
        {provider === 'ollama' &&
          'Your own Ollama, over the local network. Nothing leaves your machine.'}
        {needsBaseUrl && 'Whatever endpoint you point it at. Your quests and history go to that server.'}
        {isRemote &&
          `Your quest titles, level and history are sent to ${PROVIDER_LABELS[provider]} to write each line.`}
      </p>

      {isBrowser ? (
        <>
          {gpu === false && (
            <p className="danger-panel" style={{ fontSize: 12, lineHeight: 1.5 }}>
              This browser has no WebGPU, so the in-browser model cannot run here. Chrome 113+,
              Edge 113+, Firefox 141+ or Safari 26+ can. The System falls back to its own script.
            </p>
          )}

          <div className="row">
            <label style={{ fontSize: 13 }} htmlFor="webllmModel">Model</label>
            <select
              id="webllmModel"
              name="webllmModel"
              className="field"
              style={{ maxWidth: 280, minHeight: 36 }}
              value={chosenWebllm}
              onChange={(e) => setChosenWebllm(e.target.value)}
            >
              {models === null ? (
                <option value={chosenWebllm}>{chosenWebllm}</option>
              ) : (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} · {gb(m.vramMb)}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="row">
            <span style={{ fontSize: 13 }}>
              {cached === null ? 'Checking cache…' : cached ? 'Downloaded' : 'Not downloaded yet'}
            </span>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={preload}
              disabled={progress !== null || gpu === false}
              style={{ minHeight: 36, padding: '6px 12px', fontSize: 10 }}
            >
              {progress ? 'Downloading…' : cached ? 'Reload' : 'Download now'}
            </button>
          </div>

          {progress && (
            <div className="stack" style={{ gap: 5 }}>
              <span className="bar bar--thin">
                <i style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </span>
              <span className="faint" style={{ fontSize: 10.5 }}>{progress.text}</span>
            </div>
          )}

          {loadError && (
            <p className="danger-panel" style={{ fontSize: 11.5 }}>{loadError}</p>
          )}

          <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
            Downloading is a one-time cost of a few hundred megabytes to a few gigabytes. Smaller
            models answer faster and write worse lines; the System falls back to its own script
            whenever the model produces nothing.
          </p>
        </>
      ) : (
        provider !== 'none' && (
          <div className="row">
            <label style={{ fontSize: 13 }} htmlFor="aiModel">Model</label>
            <BoundInput
              id="aiModel"
              name="aiModel"
              className="field"
              style={{ maxWidth: 280, minHeight: 36 }}
              defaultValue={model}
              placeholder={DEFAULT_MODELS[provider]}
            />
          </div>
        )
      )}

      {(needsBaseUrl || provider === 'ollama') && (
        <div className="row">
          <label style={{ fontSize: 13 }} htmlFor="aiBaseUrl">Endpoint</label>
          <BoundInput
            id="aiBaseUrl"
            name="aiBaseUrl"
            className="field"
            style={{ maxWidth: 280, minHeight: 36 }}
            defaultValue={baseUrl}
            placeholder="http://localhost:11434"
          />
        </div>
      )}

      {isRemote && (
        <div className="row">
          <span style={{ fontSize: 13 }}>API key</span>
          <span className="numeric" style={{ fontSize: 12, color: apiKeyPresent ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {apiKeyPresent ? 'server key configured' : 'server key not configured'}
          </span>
        </div>
      )}

      {provider !== 'none' && (
        <>
          <div className="row">
            <label style={{ fontSize: 13 }} htmlFor="aiMaxOutputTokens">Answer budget</label>
            <BoundInput id="aiMaxOutputTokens" name="aiMaxOutputTokens" type="number" min={50} max={4000}
                   defaultValue={maxOutputTokens} className="field" style={{ width: 110, minHeight: 36 }} />
          </div>

          <div className="row">
            <label style={{ fontSize: 13 }} htmlFor="aiThinking">Let it think first</label>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="hidden" name="aiThinkingPresent" value="1" />
              <input
                id="aiThinking"
                name="aiThinking"
                type="checkbox"
                checked={thinks}
                onChange={(e) => setThinks(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: 'var(--color-accent)' }}
              />
            </span>
          </div>

          {thinks && (
            <>
              <div className="row">
                <label style={{ fontSize: 13 }} htmlFor="aiReasoningTokens">Reasoning headroom</label>
                <BoundInput id="aiReasoningTokens" name="aiReasoningTokens" type="number" min={0} max={32000} step={500}
                       defaultValue={reasoningTokens} className="field" style={{ width: 110, minHeight: 36 }} />
              </div>
              <div className="row">
                <label style={{ fontSize: 13 }} htmlFor="aiThinkingTimeoutMs">Give up after</label>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BoundInput id="aiThinkingTimeoutMs" name="aiThinkingTimeoutMs" type="number" min={5000} max={600000} step={5000}
                         defaultValue={thinkingTimeoutMs} className="field" style={{ width: 110, minHeight: 36 }} />
                  <span className="faint" style={{ fontSize: 11 }}>ms</span>
                </span>
              </div>
              <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
                Thinking writes better lines and costs real time — tens of seconds rather than a
                few on a local model. A thinking model given too little headroom returns nothing
                at all, having spent it reasoning, so the System retries without thinking when an
                attempt overruns. It always says something.
              </p>
            </>
          )}
        </>
      )}

      {isLocalEngine && (
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
          {isBrowser
            ? 'No key needed, and nothing to run alongside the app.'
            : 'No key needed. Ollama must be running for this to work.'}
        </p>
      )}
    </section>
  )
}
