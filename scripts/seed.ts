import { migrateDb, openDb } from '../src/db/client'
import { createHunter, getHunter } from '../src/db/hunters'
import { seedTemplates } from '../src/db/seedTemplates'

const path = process.env.DATABASE_PATH ?? './data/unranked.db'
const id = process.env.HUNTER_ID ?? 'solo'

const db = openDb(path)
migrateDb(db)

if (!getHunter(db, id)) {
  createHunter(db, {
    id,
    name: process.env.HUNTER_NAME ?? 'Hunter',
    timezone: process.env.HUNTER_TIMEZONE ?? 'UTC',
    dailyResetHour: Number(process.env.DAILY_RESET_HOUR ?? 4),
  })
  console.log(`awakened hunter ${id}`)
}

console.log(`installed ${seedTemplates(db, id)} quest templates`)
