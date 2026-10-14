/// <reference lib="webworker" />
import * as tts from '@mintplex-labs/piper-tts-web'
import { downloadVoice, voiceStored } from './piperAssets'
import { requirePiperVoice } from './piperVoices'
const scope = self as unknown as DedicatedWorkerGlobalScope
// Single thread also works without SharedArrayBuffer on Safari and non-isolated pages.
Object.defineProperty(navigator, 'hardwareConcurrency', { value: 1 })
let chain = Promise.resolve()
let current: { voiceId: string; session: tts.TtsSession } | null = null
scope.onmessage = ({ data }) => {
  chain = chain.catch(() => {}).then(async () => {
    try {
      let value: unknown
      const progress = (report: tts.Progress) => scope.postMessage({ id: data.id, progress: report.total ? report.loaded / report.total : 0, label: report.url })
      if (data.type === 'stored') { const found = await tts.stored(); value = (await Promise.all(found.map(async id => await voiceStored(id) ? id : null))).filter(Boolean) }
      else {
        requirePiperVoice(data.voiceId)
        if (data.type === 'download') { await downloadVoice(data.voiceId, value => progress({ url: data.voiceId, total: 100, loaded: value*100 })); value = await tts.stored() }
        else if (data.type === 'speak') {
          if (!(await voiceStored(data.voiceId))) throw new Error('Download this Piper voice in assistant settings first.')
          if (current?.voiceId !== data.voiceId) current = { voiceId: data.voiceId, session: await tts.TtsSession.create({ voiceId: data.voiceId, wasmPaths: { onnxWasm: '/assistant/ort/', piperData: '/assistant/piper/piper_phonemize.data', piperWasm: '/assistant/piper/piper_phonemize.wasm' } }) }
          value = await current!.session.predict(data.text)
        } else throw new Error('Unknown voice operation')
      }
      scope.postMessage({ id: data.id, value })
    } catch (error) { scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) }) }
  })
}
