import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { createTestDb } from './helpers/db'

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
  it('applies to a populated database without changing lookup results or active-job uniqueness', () => {
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
      for (let source = 0; source < 120; source += 1) {
        const sourceId = `source-${source}`
        insertSource.run(sourceId)
        for (let item = 0; item < 6; item += 1) {
          const jobId = `job-${source}-${item}`
          insertJob.run(jobId, sourceId, Math.floor(item / 2), Math.floor(item / 2))
          insertCitation.run(`citation-${source}-${item}`, sourceId, Math.floor(item / 2))
          insertRun.run(`cursor-${source}-${item}`, jobId, `run-${source}-${item}`)
        }
      }
    })()

    const target = 'source-42'
    const before = {
      latest: sqlite.prepare(latestJobSql).get(target),
      batch: sqlite.prepare(batchLatestSql).all(target, 'source-43'),
      citations: sqlite.prepare(citationsSql).all(target),
    }
    expect(before.latest).toMatchObject({ id: 'job-42-5' })
    expect((before.citations as { id: string }[]).map((row) => row.id)).toEqual(
      Array.from({ length: 6 }, (_, item) => `citation-42-${item}`),
    )
    expect(plan(sqlite, latestJobSql, target).some((detail) => detail.includes('SCAN jobs'))).toBe(true)
    expect(plan(sqlite, citationsSql, target).some((detail) => detail.includes('SCAN citations'))).toBe(true)
    expect(plan(sqlite, updateRunSql, 'RUNNING', 'run-42-5').some((detail) => detail.includes('SCAN cursor_runs'))).toBe(true)

    sqlite.exec(readFileSync(join(migrationDir, indexMigration), 'utf8').replace(/--> statement-breakpoint/g, ''))

    expect(sqlite.prepare(latestJobSql).get(target)).toEqual(before.latest)
    expect(sqlite.prepare(batchLatestSql).all(target, 'source-43')).toEqual(before.batch)
    expect(sqlite.prepare(citationsSql).all(target)).toEqual(before.citations)
    expect(indexedLookup(sqlite, latestJobSql, 'jobs_source_created_idx', target)).not.toContain(
      'USE TEMP B-TREE FOR ORDER BY',
    )
    indexedLookup(sqlite, batchLatestSql, 'jobs_source_created_idx', target, 'source-43')
    expect(indexedLookup(sqlite, citationsSql, 'citations_source_created_idx', target)).not.toContain(
      'USE TEMP B-TREE FOR ORDER BY',
    )
    indexedLookup(sqlite, updateRunSql, 'cursor_runs_run_idx', 'FINISHED', 'run-42-5')

    expect(sqlite.prepare(updateRunSql).run('FINISHED', 'run-42-5').changes).toBe(1)
    expect(sqlite.prepare('SELECT status FROM cursor_runs WHERE run_id = ?').get('run-42-5')).toEqual({
      status: 'FINISHED',
    })
    const insertActive = sqlite.prepare(`INSERT INTO jobs
      (id, source_id, kind, status, created_at, updated_at)
      VALUES (?, ?, 'ask_source', 'queued', 10, 10)`)
    insertActive.run('active-1', target)
    expect(() => insertActive.run('active-2', target)).toThrow()
    sqlite.close()
  })

  it('installs all three lookup indexes on a fresh database', () => {
    const { sqlite } = createTestDb()
    for (const name of ['jobs_source_created_idx', 'citations_source_created_idx', 'cursor_runs_run_idx']) {
      expect(sqlite.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('index', name)).toEqual({
        name,
      })
    }
    sqlite.close()
  })
})
