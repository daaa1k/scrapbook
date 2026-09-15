import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../src/db/schema'
import type { AppDb } from '../../src/db/types'

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle')

function migrationSql(): string {
  return readdirSync(drizzleDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(drizzleDir, name), 'utf8'))
    .join('\n')
    .replace(/--> statement-breakpoint/g, '')
}

export function createTestDb(): { db: AppDb; sqlite: Database.Database } {
  const sqlite = new Database(':memory:')
  sqlite.exec(migrationSql())
  const db = drizzle(sqlite, { schema }) as unknown as AppDb
  return { db, sqlite }
}
