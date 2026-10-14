import { build } from 'esbuild'
import { cp, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
const require = createRequire(import.meta.url)
const ort = resolve(dirname(require.resolve('onnxruntime-web')), '..')
const piper = dirname(require.resolve('@diffusionstudio/piper-wasm/package.json'))
await mkdir('public/assistant/ort', { recursive: true })
await mkdir('public/assistant/piper', { recursive: true })
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) await cp(resolve(ort, 'dist', name), resolve('public/assistant/ort', name))
for (const name of ['piper_phonemize.wasm', 'piper_phonemize.data']) await cp(resolve(piper, 'build', name), resolve('public/assistant/piper', name))
await build({ entryPoints: ['src/voice/piper.worker.ts'], outfile: 'public/assistant/piper.worker.js', bundle: true, platform: 'browser', format: 'esm', external: ['fs', 'path'], minify: true, sourcemap: false })
console.log('Local speech runtimes prepared.')
