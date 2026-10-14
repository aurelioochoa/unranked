/**
 * SQLite connection. The only place in the app that opens a database.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>

export const DEFAULT_DB_PATH = './data/unranked.db'

export function openDb(path: string = process.env.DATABASE_PATH ?? DEFAULT_DB_PATH): Db {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true })
  const sqlite = new Database(path)
  // WAL so a long dungeon-timer read never blocks a quest write.
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  return drizzle(sqlite, { schema })
}

export function migrateDb(db: Db, folder = './drizzle'): void {
  migrate(db, { migrationsFolder: folder })
}

/**
 * Process-wide handle. Cached on globalThis so Next's dev-mode module reloading
 * does not leak a new SQLite connection on every edit.
 */
const globalForDb = globalThis as unknown as { __unrankedDb?: Db }

export function getDb(): Db {
  if (!globalForDb.__unrankedDb) {
    const db = openDb()
    migrateDb(db)
    globalForDb.__unrankedDb = db
  }
  return globalForDb.__unrankedDb
}

/** A fresh in-memory database with the schema applied. For tests. */
export function openTestDb(): Db {
  const db = openDb(':memory:')
  migrateDb(db)
  return db
}
