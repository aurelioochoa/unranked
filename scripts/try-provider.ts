/** Ad-hoc: stream one System line through a configured provider. */
import { createNarrator } from '../src/ai'
import { aiConfigFromEnv } from '../src/ai/config'
import type { AiCallRecord } from '../src/ai/types'

const calls: AiCallRecord[] = []
const config = aiConfigFromEnv()
const n = createNarrator(config, (r) => calls.push(r))

console.log(`provider=${config.provider} model=${config.model} → ${n.id}`)
const started = Date.now()
let out = ''
for await (const chunk of n.narrateQuestIssue({
  hunterName: 'Aurelio',
  level: 7,
  rank: 'E',
  dayKey: '2026-09-04',
  quests: [
    { title: 'Strength Training', multiplier: 0.46 },
    { title: 'Cold Exposure', multiplier: 1.25 },
  ],
  debuff: 0.45,
  activePenalties: 1,
})) {
  out += chunk
}
console.log(`\n${out.trim()}\n`)
console.log(`took ${Date.now() - started}ms`)
for (const c of calls) {
  console.log(`  call op=${c.operation} ok=${c.ok} fellBack=${c.fellBack} out=${c.outputTokens ?? '?'} tok ${c.latencyMs}ms ${c.error ?? ''}`)
}
