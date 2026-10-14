/* Cactus calls are serialized: the process-global engine is not thread safe. */
importScripts('/assistant/needle.js');
let engine, modelPointers = [], chain = Promise.resolve();
const CAPACITY = 65536;
async function asset(url, id) {
  const cache = await caches.open('unranked-cactus-v1');
  const cached = await cache.match(url);
  if (cached) return new Uint8Array(await cached.arrayBuffer());
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}). Retry Download speech models.`);
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader(); const chunks = []; let loaded = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); loaded += value.length; postMessage({ id, progress: total ? loaded / total : 0, label: url.split('/').pop().split('?')[0] }); }
  const data = new Uint8Array(loaded); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  await cache.put(url, new Response(data, { headers: { 'content-type': 'application/octet-stream' } }));
  return data;
}
function call(name, types, args) {
  const result = engine.ccall(name, 'number', types, args);
  if (result < 0) throw new Error(engine.ccall('needle_last_error', 'string', [], []));
  return result;
}
function output(name, types, args) {
  const ptr = engine._malloc(CAPACITY);
  try { call(name, [...types, 'number', 'number'], [...args, ptr, CAPACITY]); return JSON.parse(engine.UTF8ToString(ptr)); }
  finally { engine._free(ptr); }
}
function pcmCall(name, pcm, language, keywords) {
  const ptr = engine._malloc(pcm.byteLength);
  try {
    new Float32Array(engine.HEAPU8.buffer, ptr, pcm.length).set(pcm);
    return output(name, ['number', 'number', 'string', 'string'], [ptr, pcm.length, language === 'auto' ? null : language, keywords || 'ajustes\nmazmorra\nmisiones\ndespertar\nGreat Sage\nUnranked']);
  } finally { engine._free(ptr); }
}
async function run(message) {
  if (message.type === 'load') {
    if (!engine) engine = await createNeedle({ locateFile: () => '/assistant/needle.wasm', ENV: { NEEDLE_TELEMETRY: '0', DO_NOT_TRACK: '1' } });
    for (const [kind, url] of [[1, 'https://huggingface.co/Cactus-Compute/needle3/resolve/93e88ede867e4311c39151285e74df513e4b835b/needle3.cact?download=true'], [2, 'https://huggingface.co/Cactus-Compute/whistle/resolve/ca5287601bef25af26dcf2e1b2bdc0843a7c19e5/whistle.cact?download=true']]) {
      if (engine._needle_models() & kind) continue;
      const bytes = await asset(url, message.id); const ptr = engine._malloc(bytes.length);
      engine.HEAPU8.set(bytes, ptr);
      // Emscripten WASM_BIGINT exposes the unsigned long long length as BigInt.
      const loaded = engine._needle_load(ptr, BigInt(bytes.length));
      if (loaded < 0) { engine._free(ptr); await (await caches.open('unranked-cactus-v1')).delete(url); throw new Error(engine.ccall('needle_last_error', 'string', [], [])); }
      // The runtime maps weights in place; keep the model buffer alive.
      modelPointers.push(ptr);
    }
    return { ready: true };
  }
  if (!engine || engine._needle_models() !== 3) throw new Error('Download speech models first.');
  if (message.type === 'route') {
    call('needle_init', ['string', 'string', 'string'], [message.system, JSON.stringify(message.tools), null]);
    try { return output('needle_complete', ['string','number','number','number'], [message.text, 0, 0, 400]); }
    finally { engine._needle_reset(); }
  }
  if (message.type === 'audio') return pcmCall('needle_stream_transcribe_process', message.pcm, message.language, message.keywords);
  if (message.type === 'finalize') return output('needle_stream_transcribe_stop', [], []);
  throw new Error('Unknown speech operation');
}
onmessage = ({ data }) => {
  chain = chain.catch(() => {}).then(async () => {
    try { postMessage({ id: data.id, value: await run(data) }); }
    catch (error) { postMessage({ id: data.id, error: error.message || String(error) }); }
  });
};
