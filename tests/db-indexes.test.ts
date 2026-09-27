import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

const migrationDir = join(dirname(fileURLToPath(import.meta.url)), '../drizzle')
const indexMigration = '0006_lookup_indexes.sql'

const latestJobSql =
  'SELECT id, status, kind FROM jobs WHERE source_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'
const batchLatestSql = `SELECT source_id, status, kind FROM (
  SELECT source_id, status, kind,
    row_number() OVER (PARTITION BY source_id ORDER BY created_at DESC, rowid DESC) AS rank
  FROM jobs WHERE source_id IN (?, ?)
) WHERE rank = 1 ORDER BY source_id`
const citationsSql =
  'SELECT id, locator FROM citations WHERE source_id = ? ORDER BY created_at, rowid'
const updateRunSql = 'UPDATE cursor_runs SET status = ? WHERE run_id = ?'

function plan(sqlite: Database.Database, query: string, ...params: string[]) {
  return sqlite
    .prepare(`EXPLAIN QUERY PLAN ${query}`)
    .all(...params)
    .map((row) => (row as { detail: string }).detail)
}

function indexedLookup(sqlite: Database.Database, query: string, index: string, ...params: string[]) {
  const details = plan(sqlite, query, ...params)
  expect(details.some((detail) => detail.includes(`SEARCH `) && detail.includes(`USING INDEX ${index}`))).toBe(
    true,
  )
  return details
}

describe('lookup indexes', () => {
  it('uses lookup indexes for the production queries and preserves active-job uniqueness', () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    for (const name of readdirSync(migrationDir).filter((name) => name.endsWith('.sql') && name < indexMigration).sort()) {
      sqlite.exec(readFileSync(join(migrationDir, name), 'utf8').replace(/--> statement-breakpoint/g, ''))
    }

    sqlite.prepare('INSERT INTO notebooks (id, title, created_at, updated_at) VALUES (?, ?, 0, 0)').run('notebook', 'Notebook')
    const insertSource = sqlite.prepare(`INSERT INTO sources
      (id, notebook_id, kind, fetch_status, acquired_via, created_at, updated_at)
      VALUES (?, 'notebook', 'paste', 'full', 'paste', 0, 0)`)
    const insertJob = sqlite.prepare(`INSERT INTO jobs
      (id, source_id, kind, status, created_at, updated_at)
      VALUES (?, ?, 'fetch', 'failed', ?, ?)`)
    const insertCitation = sqlite.prepare(`INSERT INTO citations
      (id, source_id, locator, excerpt, created_at) VALUES (?, ?, '0:1', 'excerpt', ?)`)
    const insertRun = sqlite.prepare(`INSERT INTO cursor_runs
      (id, job_id, agent_id, run_id, status, created_at, updated_at)
      VALUES (?, ?, 'agent', ?, 'RUNNING', 0, 0)`)
    sqlite.transaction(() => {
      insertSource.run('source-1')
      insertSource.run('source-2')
      insertJob.run('job-1-old', 'source-1', 1, 1)
      insertJob.run('job-1-new', 'source-1', 2, 2)
      insertJob.run('job-2', 'source-2', 1, 1)
      insertCitation.run('citation-1-old', 'source-1', 1)
      insertCitation.run('citation-1-new', 'source-1', 2)
      insertCitation.run('citation-2', 'source-2', 1)
      insertRun.run('cursor-1-old', 'job-1-old', 'run-old')
      insertRun.run('cursor-1-new', 'job-1-new', 'run-target')
    })()

    const target = 'source-1'

    sqlite.exec(readFileSync(join(migrationDir, indexMigration), 'utf8').replace(/--> statement-breakpoint/g, ''))

    expect(sqlite.prepare(latestJobSql).get(target)).toMatchObject({ id: 'job-1-new' })
    indexedLookup(sqlite, batchLatestSql, 'jobs_source_created_idx', target, 'source-2')
    expect(sqlite.prepare(citationsSql).all(target)).toHaveLength(2)
    indexedLookup(sqlite, latestJobSql, 'jobs_source_created_idx', target)
    indexedLookup(sqlite, citationsSql, 'citations_source_created_idx', target)
    indexedLookup(sqlite, updateRunSql, 'cursor_runs_run_idx', 'FINISHED', 'run-target')

    expect(sqlite.prepare(updateRunSql).run('FINISHED', 'run-target').changes).toBe(1)
    expect(sqlite.prepare('SELECT status FROM cursor_runs WHERE run_id = ?').get('run-target')).toEqual({
      status: 'FINISHED',
    })
    const insertActive = sqlite.prepare(`INSERT INTO jobs
      (id, source_id, kind, status, created_at, updated_at)
      VALUES (?, ?, 'ask_source', 'queued', 10, 10)`)
    insertActive.run('active-1', target)
    expect(() => insertActive.run('active-2', target)).toThrow()
    sqlite.close()
  })
})
