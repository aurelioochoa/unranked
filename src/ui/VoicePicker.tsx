'use client'

import { armPiper, downloadPiperVoice } from '@/voice/piper'
import { useFormFieldEffect, BoundInput } from '@/assistant/bindings'

import { useEffect, useState } from 'react'
import { createVoice, VOICE_ADAPTERS, type VoiceAdapterId, type VoiceDescriptor } from '@/voice'

const ADAPTER_LABELS: Record<VoiceAdapterId, string> = {
  none: 'silent',
  webspeech: 'browser (free, offline)',
  elevenlabs: 'ElevenLabs',
  openai: 'OpenAI',
  local: 'local Piper (free)',
}

/**
 * Choosing the System's voice.
 *
 * `speechSynthesis.getVoices()` is asynchronous and comes back empty on the
 * first call in Chrome — the adapter waits for `voiceschanged` behind the
 * scenes, which is why this list is loaded in an effect rather than read
 * synchronously. Reading it straight would render an empty picker on first load.
 */
export function VoicePicker({
  adapter,
  voiceId,
  rate,
  pitch,
  volume,
}: {
  adapter: VoiceAdapterId
  voiceId: string | null
  rate: number
  pitch: number
  volume: number
}) {
  const [selected, setSelected] = useState<VoiceAdapterId>(adapter)
  const [chosenVoice, setChosenVoice] = useState(voiceId ?? '')
  const [liveRate, setLiveRate] = useState(rate)
  const [livePitch, setLivePitch] = useState(pitch)
  const [liveVolume, setLiveVolume] = useState(volume)
  const [voices, setVoices] = useState<VoiceDescriptor[] | null>(null)
  const [downloadStatus, setDownloadStatus] = useState('')
  const [available, setAvailable] = useState(true)

  useFormFieldEffect('voiceAdapter', v => setSelected(String(v) as VoiceAdapterId))
  useFormFieldEffect('voiceId', v => setChosenVoice(String(v ?? "")))
  useFormFieldEffect('voiceRate', v => setLiveRate(Number(v)))
  useFormFieldEffect('voicePitch', v => setLivePitch(Number(v)))
  useFormFieldEffect('voiceVolume', v => setLiveVolume(Number(v)))

  useEffect(() => {
    let cancelled = false
    const voice = createVoice(selected)
    setAvailable(voice.available)
    setVoices(null)
    voice
      .listVoices()
      .then((list) => {
        if (!cancelled) setVoices(list)
      })
      .catch(() => {
        if (!cancelled) setVoices([])
      })

    return () => {
      cancelled = true
    }
  }, [selected])

  // Previews with the values currently on screen, not the saved ones — the
  // point of a test button is to hear the change before committing to it.
  const preview = () => {
    if (selected === 'local') armPiper()
    const voice = createVoice(selected)
    async function* line(): AsyncIterable<string> {
      yield '[Daily Quest has arrived.] '
      yield 'Failure to complete it will result in an appropriate penalty.'
    }
    voice.speak(line(), {
      voiceId: chosenVoice || null,
      rate: liveRate,
      pitch: livePitch,
      volume: liveVolume,
    })
  }

  return (
    <section className="stack" style={{ gap: 8 }}>
      <h2 className="label">Voice</h2>

      <div className="row">
        <label style={{ fontSize: 13 }} htmlFor="voiceAdapter">Engine</label>
        <select
          id="voiceAdapter"
          name="voiceAdapter"
          className="field"
          style={{ width: 210, minHeight: 36 }}
          value={selected}
          onChange={(e) => setSelected(e.target.value as VoiceAdapterId)}
        >
          {VOICE_ADAPTERS.map((a) => (
            <option key={a} value={a}>
              {ADAPTER_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      {!available && selected !== 'none' && (
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
          Not wired up yet — selecting it leaves the System silent. The browser engine works today.
        </p>
      )}

      {/*
        A browser with a speech engine but no installed voices will accept
        speak() and produce nothing at all. Saying so beats leaving someone
        wondering why the System is mute.
      */}
      {available && selected === 'webspeech' && voices !== null && voices.length === 0 && (
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
          This browser reports no installed voices, so the System cannot speak here. On Linux that
          usually means <span className="numeric">speech-dispatcher</span> was not running when the
          browser started — restart the browser and check again. On macOS and Windows the system
          voices are used automatically.
        </p>
      )}

      <div className="row">
        <label style={{ fontSize: 13 }} htmlFor="voiceId">Voice</label>
        <select
          id="voiceId"
          name="voiceId"
          className="field"
          style={{ width: 210, minHeight: 36 }}
          value={chosenVoice}
          onChange={(e) => setChosenVoice(e.target.value)}
          disabled={!voices || voices.length === 0}
        >
          <option value="">default</option>
          {(voices ?? []).map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.lang})
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <label style={{ fontSize: 13 }} htmlFor="voiceRate">Rate</label>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input id="voiceRate" name="voiceRate" type="range" min={50} max={200} step={2}
                 value={liveRate} onChange={(e) => setLiveRate(Number(e.target.value))}
                 style={{ width: 120, accentColor: 'var(--color-accent)' }} />
          <span className="numeric faint" style={{ fontSize: 11, width: 38, textAlign: 'right' }}>{liveRate}%</span>
        </span>
      </div>

      <div className="row">
        <label style={{ fontSize: 13 }} htmlFor="voicePitch">Pitch</label>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input id="voicePitch" name="voicePitch" type="range" min={10} max={200} step={2}
                 value={livePitch} onChange={(e) => setLivePitch(Number(e.target.value))}
                 style={{ width: 120, accentColor: 'var(--color-accent)' }} />
          <span className="numeric faint" style={{ fontSize: 11, width: 38, textAlign: 'right' }}>{livePitch}%</span>
        </span>
      </div>

      <div className="row">
        <label style={{ fontSize: 13 }} htmlFor="voiceVolume">Volume</label>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input id="voiceVolume" name="voiceVolume" type="range" min={0} max={100} step={5}
                 value={liveVolume} onChange={(e) => setLiveVolume(Number(e.target.value))}
                 style={{ width: 120, accentColor: 'var(--color-accent)' }} />
          <span className="numeric faint" style={{ fontSize: 11, width: 38, textAlign: 'right' }}>{liveVolume}%</span>
        </span>
      </div>

      {selected === 'local' && <div className="row"><span className="faint">{downloadStatus || 'Download the voice before using it.'}</span><button type="button" className="btn btn--ghost" onClick={() => { void downloadPiperVoice(chosenVoice || 'en_US-ljspeech-high', value => setDownloadStatus(`${Math.round(value * 100)}%`)).then(() => setDownloadStatus('Voice ready')).catch(error => setDownloadStatus(error.message)) }}>Download voice</button></div>}
      <div className="row">
        <span style={{ fontSize: 13 }}>Test</span>
        <button type="button" onClick={preview} className="btn btn--ghost"
                disabled={selected === 'none' || !available}
                style={{ minHeight: 36, padding: '6px 14px', fontSize: 10 }}>
          Hear it
        </button>
      </div>
    </section>
  )
}
