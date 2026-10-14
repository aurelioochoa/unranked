/**
 * The browser's own speech engine.
 *
 * Default for a reason: free, offline, zero network latency, and `getVoices()`
 * gives a genuine picker of every voice installed on the machine — which is
 * exactly what "make the voice configurable" asks for, without an API key.
 *
 * Two browser facts this file exists to absorb:
 *
 * - `getVoices()` is asynchronous and returns an empty list on first call in
 *   Chrome. Read it without waiting for `voiceschanged` and the picker renders
 *   blank on first load.
 * - iOS and Safari refuse to play audio that was not started by a user gesture.
 *   `armSpeech()` is the explicit "System online" tap that buys permission for
 *   the rest of the session.
 */

import type { SpeechPort, VoiceDescriptor, VoiceOptions } from './types'

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

function clampPercent(value: number | undefined, fallback = 100): number {
  const v = value ?? fallback
  return Math.min(200, Math.max(10, v)) / 100
}

export class WebSpeechPort implements SpeechPort {
  readonly id = 'webspeech' as const
  #voices: SpeechSynthesisVoice[] = []

  get available(): boolean {
    return synth() !== null && typeof SpeechSynthesisUtterance !== 'undefined'
  }

  async listVoices(): Promise<VoiceDescriptor[]> {
    const s = synth()
    if (!s) return []

    const read = () => s.getVoices()
    let voices = read()

    if (voices.length === 0) {
      // Chrome populates the list asynchronously. Wait for the event, but never
      // hang the settings screen on a browser that will not fire it.
      voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
        const timer = setTimeout(() => {
          s.removeEventListener('voiceschanged', onChange)
          resolve(read())
        }, 1500)
        const onChange = () => {
          clearTimeout(timer)
          s.removeEventListener('voiceschanged', onChange)
          resolve(read())
        }
        s.addEventListener('voiceschanged', onChange)
      })
    }

    this.#voices = voices
    return voices.map((v) => ({
      id: v.voiceURI,
      name: v.name,
      lang: v.lang,
      local: v.localService,
    }))
  }

  utter(text: string, opts: VoiceOptions): Promise<void> {
    const s = synth()
    if (!s) return Promise.resolve()

    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text)

      if (opts.voiceId) {
        const match = this.#voices.find((v) => v.voiceURI === opts.voiceId) ?? s.getVoices().find((v) => v.voiceURI === opts.voiceId)
        if (match) u.voice = match
      }
      u.rate = clampPercent(opts.rate)
      u.pitch = clampPercent(opts.pitch)
      u.volume = Math.min(1, Math.max(0, (opts.volume ?? 100) / 100))

      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        resolve()
      }
      u.onend = finish
      // An error must resolve, not reject: one dead utterance should not take
      // down the rest of the System's line.
      u.onerror = finish

      s.speak(u)
    })
  }

  cancel(): void {
    synth()?.cancel()
  }
}

/**
 * Buy audio permission with a user gesture. Call from a click handler once per
 * session — otherwise iOS silently drops every later utterance.
 */
export function armSpeech(): boolean {
  const s = synth()
  if (!s || typeof SpeechSynthesisUtterance === 'undefined') return false
  const u = new SpeechSynthesisUtterance('')
  u.volume = 0
  s.speak(u)
  s.cancel()
  return true
}
