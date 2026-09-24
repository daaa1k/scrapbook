import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../src/db/schema'
import type { AppDb } from '../../src/db/types'

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle')

export function migrationStatements(): string[] {
  return readdirSync(drizzleDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .flatMap((name) => readFileSync(join(drizzleDir, name), 'utf8').split('--> statement-breakpoint'))
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function migrationSql(): string {
  return migrationStatements().join('\n')
}

export function createTestDb(): { db: AppDb; sqlite: Database.Database } {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(migrationSql())
  const db = drizzle(sqlite, { schema }) as unknown as AppDb
  return { db, sqlite }
}
