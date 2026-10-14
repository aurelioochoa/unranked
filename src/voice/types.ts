/**
 * The voice gateway. Mirrors `src/ai` exactly: one interface, swappable
 * adapters, and a `none` that is a supported way to run the app.
 *
 * `ai` and `voice` swap independently — local Ollama text spoken by an
 * ElevenLabs voice, or Anthropic text spoken by the free browser voice, must
 * both work.
 */

export const VOICE_ADAPTERS = ['none', 'webspeech', 'elevenlabs', 'openai', 'local'] as const
export type VoiceAdapterId = (typeof VOICE_ADAPTERS)[number]

/** When the System is allowed to speak without being asked. */
export const VOICE_POLICIES = ['ALWAYS', 'EVENTS', 'MANUAL'] as const
export type VoicePolicy = (typeof VOICE_POLICIES)[number]

export interface VoiceDescriptor {
  readonly id: string
  readonly name: string
  readonly lang: string
  readonly local: boolean
}

export interface VoiceOptions {
  readonly onStop?: () => void
  readonly onError?: (message: string) => void
  readonly voiceId?: string | null
  /** Percent of the engine's normal rate. 100 = normal. */
  readonly rate?: number
  readonly pitch?: number
  readonly volume?: number
}

export interface SpeechHandle {
  /** Resolves when every sentence has been spoken, or the handle is stopped. */
  readonly done: Promise<void>
  /** Barge-in. Cancels immediately; a System that talks over you is worse than a silent one. */
  stop(): void
}

export interface SystemVoice {
  readonly id: VoiceAdapterId
  /** True when this adapter can actually produce audio in this environment. */
  readonly available: boolean
  speak(stream: AsyncIterable<string>, opts?: VoiceOptions): SpeechHandle
  listVoices(): Promise<VoiceDescriptor[]>
  stop(): void
}

/**
 * The minimum an engine must do. Keeping this narrow is what makes the queueing,
 * chunking and barge-in logic testable without a browser.
 */
export interface SpeechPort {
  readonly id: VoiceAdapterId
  readonly available: boolean
  /** Speak one complete utterance. Resolves when it finishes or is cancelled. */
  utter(text: string, opts: VoiceOptions): Promise<void>
  cancel(): void
  listVoices(): Promise<VoiceDescriptor[]>
}
