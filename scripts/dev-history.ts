/**
 * Development helper: give the local hunter real history, ending yesterday,
 * so the decay indicators and level display have something to show in the
 * browser. Never run against anything you care about.
 */
import { migrateDb, openDb } from '../src/db/client'
import { createHunter, getHunter, hunterState, requireHunter } from '../src/db/hunters'
import { seedTemplates } from '../src/db/seedTemplates'
import { completeQuest, issueQuestsForDay, sweepDeadlines } from '../src/db/questRepo'
import { clearRunById, startRun } from '../src/db/dungeonRepo'

const dbPath = process.env.DATABASE_PATH ?? './data/unranked.db'
const id = process.env.HUNTER_ID ?? 'solo'
const days = Number(process.argv[2] ?? 10)

const db = openDb(dbPath)
migrateDb(db)
if (!getHunter(db, id)) {
  createHunter(db, {
    id,
    name: process.env.HUNTER_NAME ?? 'Aurelio',
    timezone: process.env.HUNTER_TIMEZONE ?? 'Europe/Madrid',
    dailyResetHour: Number(process.env.DAILY_RESET_HOUR ?? 4),
  })
  seedTemplates(db, id)
}

const DAY = 86_400_000
const now = Date.now()

for (let d = days; d >= 1; d--) {
  const at = now - d * DAY
  sweepDeadlines(db, id, at)
  const issued = issueQuestsForDay(db, id, at)
  for (const q of issued) {
    // Core dailies get done every day — that is what drives the decay curve.
    // Rotating ones get skipped often, which is what makes them come back fresh.
    const core = q.templateId.includes('strength') || q.templateId.includes('sleep') || q.templateId.includes('meditate')
    if (!core && d % 3 !== 0) continue
    try {
      completeQuest(db, q.id, at + 3_600_000)
    } catch {
      /* past deadline for that simulated day */
    }
  }
  if (d % 3 === 0) {
    const run = startRun(db, id, { objective: `Deep work, day -${d}`, track: 'MIND', plannedMs: 50 * 60_000 }, at + 2 * 3_600_000)
    clearRunById(db, run.id, at + 2 * 3_600_000 + 50 * 60_000)
  }
}

sweepDeadlines(db, id, now)
const s = hunterState(requireHunter(db, id))
console.log(`seeded ${days} days: level ${s.level} · ${s.totalXp} xp · ${s.unspentPoints} unspent · ${s.gold} gold`)
