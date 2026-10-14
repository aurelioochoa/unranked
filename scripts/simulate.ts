/**
 * Time travel.
 *
 * Drives the engine through N simulated days so the decay curve, the penalty
 * escalation and the level pacing can be looked at with real history rather
 * than guessed at. Balance decisions made without this are just vibes.
 *
 *   pnpm simulate --days 30 --db ./data/sim.db --completion 0.75
 *
 * Refuses to touch the real database unless --force is given.
 */

import { migrateDb, openDb } from '../src/db/client'
import { createHunter, getHunter, hunterState, requireHunter } from '../src/db/hunters'
import { seedTemplates } from '../src/db/seedTemplates'
import {
  activePenalties,
  completeQuest,
  currentDebuff,
  issueQuestsForDay,
  sweepDeadlines,
} from '../src/db/questRepo'
import { clearRunById, startRun, sweepExpiredRuns } from '../src/db/dungeonRepo'
import { zonedTimeToUtc } from '../src/domain/clock'
import { makeRng } from '../src/domain/random'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback
}
const flag = (name: string) => process.argv.includes(`--${name}`)

const days = Number(arg('days', '30'))
const dbPath = arg('db', './data/sim.db')
const completion = Number(arg('completion', '0.75'))
const tz = arg('tz', 'Europe/Madrid')
const seed = Number(arg('seed', '7'))
const realDb = process.env.DATABASE_PATH ?? './data/unranked.db'

if (dbPath === realDb && !flag('force')) {
  console.error(`refusing to simulate into the real database (${realDb}). Pass --force if you mean it.`)
  process.exit(1)
}

const HUNTER = 'sim'
const db = openDb(dbPath)
migrateDb(db)
if (!getHunter(db, HUNTER)) {
  createHunter(db, { id: HUNTER, name: 'Simulant', timezone: tz, dailyResetHour: 4 })
  seedTemplates(db, HUNTER)
}

const rng = makeRng(seed)
const DAY = 86_400_000
const start = zonedTimeToUtc(2026, 1, 1, 9, tz)

console.log(`day  lvl    xp   gold  quests  done  pen  debuff  note`)
console.log(`---  ---  -----  -----  ------  ----  ---  ------  ----`)

for (let d = 0; d < days; d++) {
  const today = start + d * DAY

  sweepDeadlines(db, HUNTER, today)
  sweepExpiredRuns(db, HUNTER, today)
  const issued = issueQuestsForDay(db, HUNTER, today)

  let done = 0
  for (const q of issued) {
    if (rng() > completion) continue
    completeQuest(db, q.id, today + 2 * 3_600_000)
    done++
  }

  if (rng() < 0.4) {
    const run = startRun(
      db,
      HUNTER,
      { objective: `Focus block ${d}`, track: 'MIND', plannedMs: 50 * 60_000 },
      today + 4 * 3_600_000,
    )
    clearRunById(db, run.id, today + 4 * 3_600_000 + 50 * 60_000)
  }

  const h = requireHunter(db, HUNTER)
  const s = hunterState(h)
  const pen = activePenalties(db, HUNTER).length
  const debuff = currentDebuff(db, h)

  console.log(
    [
      String(d + 1).padStart(3),
      String(s.level).padStart(3),
      String(s.totalXp).padStart(5),
      String(s.gold).padStart(5),
      String(issued.length).padStart(6),
      String(done).padStart(4),
      String(pen).padStart(3),
      `${Math.round(debuff * 100)}%`.padStart(6),
      s.unspentPoints > 0 ? `${s.unspentPoints} pts unspent` : '',
    ].join('  '),
  )
}

const final = hunterState(requireHunter(db, HUNTER))
console.log(`\nafter ${days} days at ${Math.round(completion * 100)}% completion:`)
console.log(`  level ${final.level} · ${final.totalXp.toLocaleString()} xp · ${final.gold} gold`)
console.log(`  stats ${Object.entries(final.stats).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
