/**
 * The voice gateway. Everything outside this directory sees only `SystemVoice`.
 */

import { SilentPort, StreamingVoice } from './streaming'
import { PiperPort } from './piper'
import { WebSpeechPort } from './webspeech'
import type { SpeechPort, SystemVoice, VoiceAdapterId, VoiceDescriptor } from './types'

export * from './types'
export { createSentenceChunker, chunkAll, MAX_CHUNK_CHARS } from './chunker'
export { StreamingVoice, SilentPort } from './streaming'
export { WebSpeechPort, armSpeech } from './webspeech'

/**
 * A port for an adapter that is declared but not yet wired.
 *
 * It reports `available: false` so the settings screen can grey it out and say
 * so, rather than letting the user select a voice that silently does nothing.
 */
class UnavailablePort implements SpeechPort {
  readonly id: VoiceAdapterId
  readonly available = false
  constructor(id: VoiceAdapterId) {
    this.id = id
  }
  async utter(): Promise<void> {}
  cancel(): void {}
  async listVoices(): Promise<VoiceDescriptor[]> {
    return []
  }
}

export function createVoice(adapter: VoiceAdapterId): SystemVoice {
  switch (adapter) {
    case 'none':
      return new StreamingVoice(new SilentPort())
    case 'webspeech': {
      const port = new WebSpeechPort()
      // Falling back keeps the app usable in a browser with no speech engine.
      return new StreamingVoice(port.available ? port : new SilentPort())
    }
    case 'local': return new StreamingVoice(new PiperPort())
    case 'elevenlabs':
    case 'openai':
      return new StreamingVoice(new UnavailablePort(adapter))
  }
}
