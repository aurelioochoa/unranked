import { requirePiperVoice } from './piperVoices'
const rootUrl = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'
export function voiceUrl(voiceId: string): string {
  requirePiperVoice(voiceId)
  const [locale, name, quality] = voiceId.split('-')
  return `${rootUrl}/${locale!.slice(0,2)}/${locale}/${name}/${quality}/${voiceId}.onnx`
}
async function fetchAsset(url: string, progress?: (value: number) => void): Promise<Blob> {
  const response = await fetch(`${url}?download=true`, { signal: AbortSignal.timeout(300000) })
  if (!response.ok || !response.body) throw new Error(`Voice download failed (${response.status}). Retry Download voice.`)
  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader(); const chunks: Uint8Array<ArrayBuffer>[] = []; let loaded = 0
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); loaded += value.length; progress?.(total ? loaded/total : 0) }
  return new Blob(chunks)
}
export async function downloadVoice(voiceId: string, progress: (value: number) => void) {
  const url = voiceUrl(voiceId)
  const config = await fetchAsset(`${url}.json`)
  JSON.parse(await config.text()) // Never cache HTML error responses as models.
  const model = await fetchAsset(url, progress)
  if (model.size < 1000000) throw new Error('Voice download was incomplete. Retry Download voice.')
  const root = await navigator.storage.getDirectory()
  const directory = await root.getDirectoryHandle('piper', { create: true })
  for (const [name, blob] of [[`${voiceId}.onnx.json`,config],[`${voiceId}.onnx`,model]] as const) {
    const file = await directory.getFileHandle(name, { create: true }); const writable = await file.createWritable(); await writable.write(blob); await writable.close()
  }
}
export async function voiceStored(voiceId: string): Promise<boolean> {
  try {
    const root = await navigator.storage.getDirectory(); const directory = await root.getDirectoryHandle('piper')
    const model = await (await directory.getFileHandle(`${voiceId}.onnx`)).getFile()
    const config = await (await directory.getFileHandle(`${voiceId}.onnx.json`)).getFile()
    JSON.parse(await config.text()); return model.size >= 1000000
  } catch { return false }
}
