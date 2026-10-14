'use client'

import { armPiper } from '@/voice/piper'
import { useCallback, useEffect, useRef, useState } from 'react'
import { armSpeech, createVoice, type SpeechHandle, type VoiceAdapterId, type VoicePolicy } from '@/voice'
import type { PenaltyContext, QuestContext } from '@/ai/types'
import type { WebLlmProgress } from '@/ai/webllm'

/**
 * The System's line: rendered as text and spoken aloud from ONE stream.
 *
 * The generator below is consumed by the voice layer, and updates the visible
 * text as a side effect of each chunk passing through. That keeps the two
 * renderings exactly in step and means the speech starts on the first complete
 * sentence rather than after the whole generation.
 *
 * The arming button is not decoration: iOS and Safari refuse audio that was
 * not started by a user gesture, so without one explicit tap the System would
 * silently never speak on a phone — which is where this app is actually used.
 */
export function SystemSpeech({
  kind = 'quests',
  adapter,
  voiceId,
  rate,
  pitch,
  volume,
  policy,
  provider,
  webllmModel,
  questContext,
  penaltyContext,
}: {
  kind?: 'quests' | 'penalty'
  adapter: VoiceAdapterId
  voiceId: string | null
  rate: number
  pitch: number
  volume: number
  policy: VoicePolicy
  /** Which engine writes the line. `webllm` runs here, in this browser. */
  provider: string
  webllmModel: string
  questContext: QuestContext
  penaltyContext: PenaltyContext | null
}) {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle')
  const [armed, setArmed] = useState(adapter === 'none')
  const [loading, setLoading] = useState<WebLlmProgress | null>(null)
  const [needsDownload, setNeedsDownload] = useState(false)
  const handleRef = useRef<SpeechHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const startedRef = useRef(false)
  const inBrowser = provider === 'webllm'

  const run = useCallback(
    async (speak: boolean, force = false) => {
      if (startedRef.current && !force) return
      startedRef.current = true
      abortRef.current?.abort()
      const abort = new AbortController(); abortRef.current = abort
      setState('streaming')
      setText('')

      // One source, two renderings: the generator below is consumed by the
      // voice layer and updates the visible text as each chunk passes through,
      // so speech starts on the first complete sentence rather than at the end.
      const render = (source: AsyncIterable<string>): AsyncIterable<string> =>
        (async function* () {
          for await (const piece of source) {
            if (!piece) continue
            setText((prev) => prev + piece)
            yield piece
          }
        })()

      let source: AsyncIterable<string>

      if (inBrowser) {
        // Generated here, on this machine, over WebGPU. Nothing is sent anywhere.
        try {
          const mod = await import('@/ai/webllm')

          // Never start a multi-gigabyte download because someone opened a
          // page. Until the weights are cached, the System speaks its own
          // lines and offers the download as a choice.
          if (!force && !(await mod.isModelCached(webllmModel))) {
            setNeedsDownload(true)
            const { NullNarrator } = await import('@/ai/null')
            const authored = new NullNarrator()
            const fallbackSource =
              kind === 'penalty' && penaltyContext
                ? authored.narratePenalty(penaltyContext)
                : authored.narrateQuestIssue(questContext)
            const voice = createVoice(speak ? adapter : 'none')
            const handle = voice.speak(render(fallbackSource), { voiceId, rate, pitch, volume, onStop: () => abort.abort() })
            handleRef.current = handle
            await handle.done
            setState('done')
            return
          }

          setNeedsDownload(false)
          const { WebLlmNarrator } = mod
          const narrator = new WebLlmNarrator(webllmModel, {
            onProgress: (p) => setLoading(p.progress >= 1 ? null : p),
          })
          source =
            kind === 'penalty' && penaltyContext
              ? narrator.narratePenalty(penaltyContext)
              : narrator.narrateQuestIssue(questContext)
        } catch {
          setState('error')
          return
        }
      } else {
        let response: Response
        try {
          response = await fetch('/api/narrate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: abort.signal,
            body: JSON.stringify({ kind }),
          })
        } catch {
          setState('error')
          return
        }
        if (!response.ok || !response.body) {
          setState('error')
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        source = (async function* () {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) return
            yield decoder.decode(value, { stream: true })
          }
        })()
      }

      const voice = createVoice(speak ? adapter : 'none')
      const handle = voice.speak(render(source), { voiceId, rate, pitch, volume, onStop: () => abort.abort() })
      handleRef.current = handle
      await handle.done
      setLoading(null)
      setState('done')
    },
    [adapter, kind, rate, pitch, volume, voiceId, inBrowser, webllmModel, questContext, penaltyContext],
  )

  /** Explicitly fetch the weights, then regenerate the line with the model. */
  const downloadModel = () => {
    startedRef.current = false
    void run(armed, true)
  }

  useEffect(() => {
    // MANUAL means the System stays quiet until asked; the text still loads.
    if (policy === 'MANUAL') return
    void run(armed)
  }, [run, armed, policy])

  // Barge-in: leaving the page must silence it immediately.
  useEffect(() => () => { handleRef.current?.stop(); abortRef.current?.abort() }, [])

  const arm = () => {
    armSpeech()
    if (adapter === 'local') armPiper()
    setArmed(true)
    startedRef.current = false
    void run(true)
  }

  return (
    <section className="speech" aria-live="polite">
      {text ? <p style={{ margin: 0 }}>{text}</p> : null}
      {loading ? (
        <div className="stack" style={{ gap: 6 }}>
          <p className="faint" style={{ margin: 0, fontSize: 12 }}>
            Loading the System into this browser — {loading.text}
          </p>
          <span className="bar bar--thin">
            <i style={{ width: `${Math.round(loading.progress * 100)}%` }} />
          </span>
          <p className="faint" style={{ margin: 0, fontSize: 10.5 }}>
            One-time download. It is cached afterwards and works offline.
          </p>
        </div>
      ) : state === 'streaming' && !text ? (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          The System is {inBrowser ? 'thinking, on this machine' : 'deciding'}…
        </p>
      ) : null}
      {state === 'error' ? (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          The System could not be reached.
        </p>
      ) : null}

      {needsDownload && !loading ? (
        <div className="between" style={{ marginTop: 9, gap: 10, flexWrap: 'wrap' }}>
          <span className="faint" style={{ fontSize: 11, lineHeight: 1.45, flex: '1 1 180px' }}>
            The in-browser model is not downloaded yet, so this line is the System&rsquo;s own.
          </span>
          <button
            type="button"
            onClick={downloadModel}
            className="btn btn--ghost"
            style={{ minHeight: 34, padding: '6px 12px', fontSize: 10 }}
          >
            Download the model
          </button>
        </div>
      ) : null}

      <div className="between" style={{ marginTop: 9 }}>
        <span className="label">
          {inBrowser ? 'IN-BROWSER · ' : ''}
          {adapter === 'none' ? 'SILENT' : armed ? `SPEAKING · ${adapter.toUpperCase()}` : 'MUTED'}
        </span>
        {!armed && adapter !== 'none' ? (
          <button
            type="button"
            onClick={arm}
            className="btn btn--ghost"
            style={{ minHeight: 34, padding: '6px 12px', fontSize: 10 }}
          >
            System online
          </button>
        ) : armed && adapter !== 'none' ? (
          <button
            type="button"
            onClick={() => handleRef.current?.stop()}
            className="btn btn--ghost"
            style={{ minHeight: 34, padding: '6px 12px', fontSize: 10 }}
          >
            Silence
          </button>
        ) : null}
      </div>
    </section>
  )
}
