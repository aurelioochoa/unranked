import { cactus, cactusReady } from './cactus'
export interface MicrophoneSession { stop(finalize?: boolean): Promise<void> }
/** Audio stays in this browser. Streaming tails are display-only; commands run only after finalization. */
export async function startMicrophone(options: {
  language: string; keywords?: string[]; continuous: boolean; onPartial(text: string): void; onFinal(text: string): void; onSpeech(): void; onError(error: Error): void
}): Promise<MicrophoneSession> {
  if (!window.isSecureContext) throw new Error('Microphone requires HTTPS or localhost. Text commands remain available.')
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) throw new Error('This browser does not support local microphone capture. Use text commands.')
  if (!cactusReady()) throw new Error('Download Needle and Whistle in assistant settings before listening.')
  let media: MediaStream
  try { media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false }) }
  catch (error) {
    const name = error instanceof DOMException ? error.name : ''
    if (name === 'NotAllowedError') throw new Error('Microphone permission was denied. Allow access in browser settings, then retry.')
    if (name === 'NotFoundError') throw new Error('No microphone is available. Connect one and retry, or use text commands.')
    if (name === 'NotReadableError') throw new Error('The microphone could not start. Close other apps using it and retry, or use text commands.')
    throw new Error('Microphone access is unavailable. Check browser permissions and the input device, then retry. Text commands remain usable.')
  }
  let audio: AudioContext
  try { audio = new AudioContext() } catch { media.getTracks().forEach(track => track.stop()); throw new Error('Local audio could not start. Close other audio apps and retry, or use text commands.') }
  let node: AudioWorkletNode | null = null; let stopped = false; let finalizing = false; let chain = Promise.resolve()
  let committed = ''; let spoken = false; let silentFrames = 0; let packet: number[] = []
  const finish = async (tail?: Float32Array) => {
    if (tail?.length) await process(tail)
    const result = await cactus().request<{ text: string }>('finalize')
    const text = `${committed} ${result.text ?? ''}`.trim()
    committed = ''
    options.onPartial('')
    if (text && !stopped) options.onFinal(text)
  }
  const process = async (pcm: Float32Array) => {
    const result = await cactus().request<{ text: string; pending: string }>('audio', { pcm, language: options.language, keywords: options.keywords?.join('\n') })
    committed = `${committed} ${result.text ?? ''}`.trim()
    if (!stopped) options.onPartial(`${committed} ${result.pending ?? ''}`.trim())
  }
  const cleanup = async () => { node?.disconnect(); node?.port.close(); media.getTracks().forEach(track => track.stop()); if (audio.state !== 'closed') await audio.close() }
  try {
    await audio.audioWorklet.addModule('/assistant/capture.worklet.js'); await audio.resume()
    const source = audio.createMediaStreamSource(media)
    node = new AudioWorkletNode(audio, 'sage-capture')
    const mute = audio.createGain(); mute.gain.value = 0
    source.connect(node).connect(mute).connect(audio.destination)
    node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
      if (stopped || finalizing) return
      const rms = Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length)
      if (rms > 0.018) { if (!spoken) options.onSpeech(); spoken = true; silentFrames = 0 } else if (spoken) silentFrames++
      if (!spoken) return
      packet.push(...data)
      if (packet.length >= 16000) { const pcm = new Float32Array(packet); packet = []; chain = chain.then(() => process(pcm)) }
      if (silentFrames >= 9) {
        silentFrames = 0; spoken = false
        const tail = new Float32Array(packet); packet = []
        if (!options.continuous) { finalizing = true; media.getTracks().forEach(track => track.stop()) }
        chain = chain.then(() => finish(tail)).then(async () => { if (!options.continuous) { stopped = true; await cleanup() } })
      }
      chain = chain.catch(error => { options.onError(error instanceof Error ? error : new Error(String(error))); stopped = true; void cleanup() })
    }
  } catch (error) { stopped = true; await cleanup(); throw error }
  return { async stop(finalize = false) { if (stopped) return; stopped = true; await cleanup(); await chain; if (finalize) { const tail = new Float32Array(packet); packet = []; stopped = false; await finish(tail); stopped = true } else { await cactus().request('finalize'); committed = '' } } }
}
