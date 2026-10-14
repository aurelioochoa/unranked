/**
 * Turning a token stream into speech, in real time.
 *
 * Producer and consumer are decoupled on purpose. If the code that reads the
 * model's stream also awaited each utterance, the stream would stall behind the
 * speech engine and the "real-time" part would be a lie. Instead the producer
 * chunks as fast as text arrives and the consumer speaks whatever is queued.
 */

import { claimAudio } from './ownership'
import { createSentenceChunker } from './chunker'
import type { SpeechHandle, SpeechPort, SystemVoice, VoiceDescriptor, VoiceOptions } from './types'

export class StreamingVoice implements SystemVoice {
  readonly #port: SpeechPort
  #stopActive: (() => void) | null = null

  constructor(port: SpeechPort) {
    this.#port = port
  }

  get id() {
    return this.#port.id
  }

  get available() {
    return this.#port.available
  }

  speak(stream: AsyncIterable<string>, opts: VoiceOptions = {}): SpeechHandle {
    const port = this.#port
    const queue: string[] = []
    let stopped = false
    let producerDone = false
    let wake: (() => void) | null = null

    const nudge = () => {
      wake?.()
      wake = null
    }

    const produce = async () => {
      const chunker = createSentenceChunker()
      try {
        for await (const text of stream) {
          if (stopped) return
          const sentences = chunker.push(text)
          if (sentences.length > 0) {
            queue.push(...sentences)
            nudge()
          }
        }
        if (!stopped) queue.push(...chunker.flush())
      } catch {
        // A broken stream must not leave the voice hanging. Whatever was
        // already chunked still gets spoken.
        if (!stopped) queue.push(...chunker.flush())
      } finally {
        producerDone = true
        nudge()
      }
    }

    const consume = async () => {
      for (;;) {
        if (stopped) return
        const next = queue.shift()
        if (next === undefined) {
          if (producerDone) return
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          continue
        }
        try {
          await port.utter(next, opts)
        } catch (error) {
          opts.onError?.(error instanceof Error ? error.message : String(error))
          // A failed utterance is not worth abandoning the rest of the line for.
        }
      }
    }

    let resolveStop: (() => void) | undefined
    const stoppedPromise = new Promise<void>(resolve => { resolveStop = resolve })
    const stop = () => { if (stopped) return; stopped = true; opts.onStop?.(); queue.length = 0; nudge(); port.cancel(); resolveStop?.() }
    this.#stopActive?.()
    this.#stopActive = stop
    const release = port.id === 'none' ? () => {} : claimAudio(stop)
    const work = Promise.all([produce(), consume()]).then(() => undefined)

    const done = Promise.race([work, stoppedPromise]).finally(() => { release(); if (this.#stopActive === stop) this.#stopActive = null })
    return { done, stop }
  }

  listVoices(): Promise<VoiceDescriptor[]> {
    return this.#port.listVoices()
  }

  stop(): void {
    this.#stopActive?.()
    this.#port.cancel()
  }
}

/** The silent port. `voice: none` is a supported configuration, not a stub. */
export class SilentPort implements SpeechPort {
  readonly id = 'none' as const
  readonly available = true
  async utter(): Promise<void> {}
  cancel(): void {}
  async listVoices(): Promise<VoiceDescriptor[]> {
    return []
  }
}
