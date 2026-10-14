import { migrateDb, openDb } from '../src/db/client'

const path = process.env.DATABASE_PATH ?? './data/unranked.db'
migrateDb(openDb(path))
console.log(`migrated ${path}`)
