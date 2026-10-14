import { WorkerClient } from '@/assistant/workerClient'
import { PIPER_VOICES, requirePiperVoice } from './piperVoices'
import type { SpeechPort, VoiceOptions } from './types'
let client: WorkerClient | null = null
function piper() { if (!client || client.closed) client = new WorkerClient(new Worker('/assistant/piper.worker.js', { type: 'module' })); return client }
export function storedPiperVoices() { return piper().request<string[]>('stored') }
export function downloadPiperVoice(voiceId: string, progress: (value: number, label: string) => void) { requirePiperVoice(voiceId); return piper().request<string[]>('download', { voiceId }, progress) }
let audioContext: AudioContext | null = null
/** Must run synchronously in a tap handler to unlock audio on iOS. */
export function armPiper() {
  if (typeof window === 'undefined' || !window.AudioContext) return
  audioContext ??= new AudioContext()
  void audioContext.resume()
  const silent = audioContext.createBufferSource(); silent.buffer = audioContext.createBuffer(1,1,22050); silent.connect(audioContext.destination); silent.start()
}
export class PiperPort implements SpeechPort {
  readonly id = 'local' as const
  get available() { return typeof window !== 'undefined' && !!window.Worker && !!window.AudioContext }
  private source: AudioBufferSourceNode | null = null
  private cancelled = 0
  private finish: (() => void) | null = null
  async utter(text: string, options: VoiceOptions): Promise<void> {
    if (!this.available) throw new Error('Local audio is unavailable in this browser. Text commands remain usable.')
    const epoch = this.cancelled
    const voiceId = options.voiceId || (/\b(el|la|los|las|que|una|para|de|si|completado)\b/i.test(text) ? 'es_MX-ald-medium' : 'en_US-ljspeech-high')
    const blob = await piper().request<Blob>('speak', { text, voiceId })
    if (epoch !== this.cancelled) return
    if (!audioContext || audioContext.state !== 'running') throw new Error('Tap Enable audio before speaking.')
    const buffer = await audioContext.decodeAudioData(await blob.arrayBuffer())
    if (epoch !== this.cancelled) return
    const source = audioContext.createBufferSource(); this.source = source; source.buffer = buffer
    source.playbackRate.value = (options.rate ?? 100) / 100
    const gain = audioContext.createGain(); gain.gain.value = (options.volume ?? 100) / 100
    source.connect(gain).connect(audioContext.destination)
    await new Promise<void>(resolve => { this.finish = resolve; source.onended = () => { gain.disconnect(); resolve(); this.finish = null }; source.start() })
  }
  cancel() { this.cancelled++; try { this.source?.stop() } catch { /* Already ended. */ }; this.source = null; this.finish?.(); this.finish = null }
  async listVoices() { return PIPER_VOICES }
}
