import { describe, it, expect } from 'vitest'
import { SilentPort, StreamingVoice } from './streaming'
import type { SpeechPort, VoiceDescriptor, VoiceOptions } from './types'

class FakePort implements SpeechPort {
  readonly id = 'webspeech' as const
  readonly available = true
  readonly spoken: string[] = []
  readonly opts: VoiceOptions[] = []
  cancelled = 0
  /** Resolve to let the current utterance finish. */
  #gate: (() => void) | null = null
  holdUtterances = false

  async utter(text: string, opts: VoiceOptions): Promise<void> {
    this.spoken.push(text)
    this.opts.push(opts)
    if (this.holdUtterances) {
      await new Promise<void>((r) => {
        this.#gate = r
      })
    }
  }

  release(): void {
    this.#gate?.()
    this.#gate = null
  }

  cancel(): void {
    this.cancelled++
    this.release()
  }

  async listVoices(): Promise<VoiceDescriptor[]> {
    return [{ id: 'v1', name: 'Test', lang: 'en-GB', local: true }]
  }
}

function deferred<T = void>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

async function* fromArray(parts: string[]): AsyncIterable<string> {
  for (const p of parts) yield p
}

describe('StreamingVoice', () => {
  it('speaks complete sentences in order', async () => {
    const port = new FakePort()
    await new StreamingVoice(port).speak(fromArray(['One. ', 'Two. ', 'Three.'])).done
    expect(port.spoken).toEqual(['One.', 'Two.', 'Three.'])
  })

  it('never speaks a half sentence', async () => {
    const port = new FakePort()
    await new StreamingVoice(port).speak(fromArray(['The penalty ', 'is act', 'ive. Done.'])).done
    expect(port.spoken).toEqual(['The penalty is active.', 'Done.'])
  })

  it('starts speaking before the stream has finished — the real-time requirement', async () => {
    const port = new FakePort()
    const gate = deferred()

    async function* slow(): AsyncIterable<string> {
      yield '[Daily Quest has arrived.] '
      await gate.promise
      yield 'Two tasks remain.'
    }

    const handle = new StreamingVoice(port).speak(slow())

    // Let the producer and consumer turn over while the stream is still open.
    await new Promise((r) => setTimeout(r, 0))
    expect(port.spoken).toEqual(['[Daily Quest has arrived.]'])

    gate.resolve()
    await handle.done
    expect(port.spoken).toEqual(['[Daily Quest has arrived.]', 'Two tasks remain.'])
  })

  it('does not stall the stream behind the speech engine', async () => {
    const port = new FakePort()
    port.holdUtterances = true
    let produced = 0

    async function* counted(): AsyncIterable<string> {
      for (const s of ['A. ', 'B. ', 'C. ']) {
        produced++
        yield s
      }
    }

    const handle = new StreamingVoice(port).speak(counted())
    await new Promise((r) => setTimeout(r, 0))

    // The first utterance is still being spoken, yet the whole stream was read.
    expect(port.spoken).toEqual(['A.'])
    expect(produced).toBe(3)

    handle.stop()
    await handle.done
  })

  it('flushes a tail with no terminator', async () => {
    const port = new FakePort()
    await new StreamingVoice(port).speak(fromArray(['No full stop here'])).done
    expect(port.spoken).toEqual(['No full stop here'])
  })

  it('stops immediately on barge-in and cancels the engine', async () => {
    const port = new FakePort()
    port.holdUtterances = true
    const handle = new StreamingVoice(port).speak(fromArray(['One. ', 'Two. ', 'Three. ']))

    await new Promise((r) => setTimeout(r, 0))
    expect(port.spoken).toEqual(['One.'])

    handle.stop()
    await handle.done

    expect(port.cancelled).toBe(1)
    expect(port.spoken).toEqual(['One.'])
  })

  it('resolves rather than hanging when the stream throws', async () => {
    const port = new FakePort()

    async function* broken(): AsyncIterable<string> {
      yield 'Partial line. '
      throw new Error('stream died')
    }

    await new StreamingVoice(port).speak(broken()).done
    expect(port.spoken).toEqual(['Partial line.'])
  })

  it('survives an engine that throws mid-line', async () => {
    const port = new FakePort()
    let call = 0
    port.utter = async (text: string) => {
      call++
      if (call === 1) throw new Error('audio device busy')
      port.spoken.push(text)
    }
    await new StreamingVoice(port).speak(fromArray(['One. ', 'Two.'])).done
    expect(port.spoken).toEqual(['Two.'])
  })

  it('passes voice options through to the engine', async () => {
    const port = new FakePort()
    await new StreamingVoice(port).speak(fromArray(['Hello.']), { voiceId: 'v1', rate: 90 }).done
    expect(port.opts[0]).toEqual({ voiceId: 'v1', rate: 90 })
  })

  it('exposes the port’s identity and voice list', async () => {
    const v = new StreamingVoice(new FakePort())
    expect(v.id).toBe('webspeech')
    expect(v.available).toBe(true)
    expect(await v.listVoices()).toHaveLength(1)
  })
})

describe('SilentPort', () => {
  it('is a working voice that simply says nothing', async () => {
    const v = new StreamingVoice(new SilentPort())
    expect(v.id).toBe('none')
    expect(v.available).toBe(true)
    await v.speak(fromArray(['Anything at all.'])).done
    expect(await v.listVoices()).toEqual([])
  })
})

describe('shared audio ownership', () => {
  it('stops the previous voice and clears queued sentences', async () => {
    const { claimAudio, stopAllAudio } = await import('./ownership')
    let firstStopped = false
    claimAudio(() => { firstStopped = true })
    let secondStopped = false
    const release = claimAudio(() => { secondStopped = true })
    expect(firstStopped).toBe(true)
    stopAllAudio()
    expect(secondStopped).toBe(true)
    release()
  })
})
