import type { VoiceDescriptor } from './types'
export const PIPER_VOICES: (VoiceDescriptor & { license: string; source: string; attribution: string })[] = [
  { id: 'en_US-ljspeech-high', name: 'LJ Speech', lang: 'en-US', local: true, license: 'Public domain', source: 'https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/high/MODEL_CARD', attribution: 'LJ Speech dataset, Keith Ito; Piper training by Bryce Beattie.' },
  { id: 'es_MX-ald-medium', name: 'Ald', lang: 'es-MX', local: true, license: 'Unlicense', source: 'https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/MODEL_CARD', attribution: 'Ald Mexican Spanish speech dataset, rmcpantoja.' },
  { id: 'en_GB-alba-medium', name: 'Alba', lang: 'en-GB', local: true, license: 'CC BY 4.0', source: 'https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_GB/alba/medium/MODEL_CARD', attribution: 'Alba, CSTR VCTK/voice cloning toolkit, University of Edinburgh. Dataset: https://datashare.ed.ac.uk/handle/10283/3270. CC BY 4.0: https://creativecommons.org/licenses/by/4.0/. Synthesized output may be modified.' },
  { id: 'es_ES-davefx-medium', name: 'Davefx', lang: 'es-ES', local: true, license: 'CC0', source: 'https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_ES/davefx/medium/MODEL_CARD', attribution: 'Davefx voice dataset, OHF Voice.' },
]
export function requirePiperVoice(id: string) { if (!PIPER_VOICES.some(v => v.id === id)) throw new Error('Choose a licensed voice from the voice picker.') }
