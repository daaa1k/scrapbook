import { Miniflare } from 'miniflare'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { createDb } from '../src/db/client'
import { jobs } from '../src/db/schema'
import { deleteNotebookWithSources, deleteSource } from '../src/server/ingest/register'
import { migrationStatements } from './helpers/db'
import { deleteGraphSnapshot, seedDeleteGraph } from './helpers/delete'

async function localD1() {
  const miniflare = new Miniflare({
    workers: [{ config: {
      name: 'test', type: 'worker', compatibilityDate: '2026-09-15',
      manifest: { mainModule: 'index.js', modules: {
        'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' },
      } },
      env: { DB: { type: 'd1', name: 'test-db' } },
    } }],
  })
  const d1 = await miniflare.getD1Database('DB')
  for (const statement of migrationStatements()) await d1.prepare(statement).run()
  return { miniflare, d1, db: createDb(d1) }
}

describe('atomic delete on local D1', () => {
  it('rolls back every source DELETE failure and deletes successfully afterward', async () => {
    const { miniflare, d1, db } = await localD1()
    try {
      const { sourceId } = await seedDeleteGraph(db)
      const before = await deleteGraphSnapshot(db)
      for (const table of ['qa_answers', 'citations', 'cursor_runs', 'jobs', 'sources']) {
        await d1.prepare(`CREATE TRIGGER reject_delete BEFORE DELETE ON ${table}
          BEGIN SELECT RAISE(ABORT, 'delete_failed'); END;`).run()
        await expect(deleteSource(db, sourceId, undefined)).rejects.toThrow('delete_failed')
        expect(await deleteGraphSnapshot(db)).toEqual(before)
        expect((await d1.prepare('PRAGMA foreign_key_check').all()).results).toEqual([])
        await d1.prepare('DROP TRIGGER reject_delete').run()
      }
      await deleteSource(db, sourceId, undefined)
      const after = await deleteGraphSnapshot(db)
      expect(after.sources).toEqual([])
      expect(after.jobs).toEqual([])
      expect(after.qaAnswers).toEqual([])
      expect(after.notebooks).toHaveLength(1)
    } finally {
      await miniflare.dispose()
    }
  }, 30_000)

  it('rolls back a notebook when its second source fails', async () => {
    const { miniflare, d1, db } = await localD1()
    try {
      const first = await seedDeleteGraph(db)
      const second = await seedDeleteGraph(db, first.notebookId)
      const before = await deleteGraphSnapshot(db)
      await d1.prepare(`CREATE TRIGGER reject_second BEFORE DELETE ON sources
        WHEN OLD.id = '${second.sourceId}'
        BEGIN SELECT RAISE(ABORT, 'second_source_failed'); END;`).run()

      await expect(deleteNotebookWithSources(db, first.notebookId, undefined)).rejects.toThrow('second_source_failed')
      expect(await deleteGraphSnapshot(db)).toEqual(before)
      expect((await d1.prepare('PRAGMA foreign_key_check').all()).results).toEqual([])
    } finally {
      await miniflare.dispose()
    }
  }, 30_000)

  it('protects a source if enqueue commits just before the delete batch', async () => {
    const { miniflare, d1, db } = await localD1()
    try {
      const { sourceId } = await seedDeleteGraph(db)
      const before = await deleteGraphSnapshot(db)
      const batch = db.batch.bind(db)
      vi.spyOn(db, 'batch').mockImplementation((async (statements) => {
        await db.insert(jobs).values({ id: 'new-job', sourceId, kind: 'fetch', status: 'queued', createdAt: 2, updatedAt: 2 })
        return batch(statements)
      }) as typeof db.batch)

      await expect(deleteSource(db, sourceId, undefined)).rejects.toThrow('source_in_progress')
      const after = await deleteGraphSnapshot(db)
      expect(after).toEqual({ ...before, jobs: [...before.jobs, expect.objectContaining({ id: 'new-job', status: 'queued' })] })
      expect(await db.select().from(jobs).where(eq(jobs.id, 'new-job'))).toHaveLength(1)
      expect((await d1.prepare('PRAGMA foreign_key_check').all()).results).toEqual([])
    } finally {
      await miniflare.dispose()
    }
  }, 30_000)
})
