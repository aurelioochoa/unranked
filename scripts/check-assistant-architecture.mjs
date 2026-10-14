import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = file => readFile(file,'utf8')
const clientFiles=['src/assistant/Assistant.tsx','src/assistant/AssistantSettings.tsx','src/assistant/cactus.ts','src/assistant/microphone.ts','src/voice/piper.ts','src/voice/piper.worker.ts']
function checkClient(source,file){assert.ok(!source.includes('process.env'),`server secret in ${file}`);assert.ok(!source.includes("from '@/db/"),`database in ${file}`)}
for(const file of clientFiles)checkClient(await read(file),file)
assert.throws(()=>checkClient('const key = process.env.OPENAI_API_KEY','positive-secret-control'))
assert.throws(()=>checkClient("import {db} from '@/db/client'",'positive-storage-control'))
for(const path of ['actions','chat','connection','history','preferences']){const source=await read(`src/app/api/assistant/${path}/route.ts`);assert.ok(source.includes('sameOrigin(request)'),`missing origin check: ${path}`)}
const cactus=await read('public/assistant/cactus.worker.js');assert.ok(cactus.includes('chain = chain.catch'));assert.ok(cactus.includes("NEEDLE_TELEMETRY: '0'"));assert.ok(!cactus.includes('supabase'))
const wrapper=await read('src/app/actions.ts');assert.ok(wrapper.includes('services.'));assert.ok(!wrapper.includes('db.insert'))
const capture=await read('src/assistant/microphone.ts');assert.ok(!capture.includes('fetch('));assert.ok(!capture.includes('MediaRecorder'));assert.ok(capture.includes('track.stop()'))
console.log('ASSISTANT ARCHITECTURE PASS')
