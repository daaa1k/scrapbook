import { Miniflare } from 'miniflare'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import { jobs, sources } from '../src/db/schema'
import { pasteSourceBody } from '../src/server/ingest/register'
import { migrationStatements } from './helpers/db'
import { seedNotebook } from './helpers/notebook'

describe('conditional body paste on local D1', () => {
  it('updates an idle source and rejects a queued job without changing the body', async () => {
    const miniflare = new Miniflare({
      workers: [{ config: {
        name: 'test', type: 'worker', compatibilityDate: '2026-09-15',
        manifest: { mainModule: 'index.js', modules: {
          'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' },
        } },
        env: { DB: { type: 'd1', name: 'test-db' } },
      } }],
    })
    try {
      const d1 = await miniflare.getD1Database('DB')
      for (const statement of migrationStatements()) await d1.prepare(statement).run()
      const db = createDb(d1)
      const first = await pasteSourceBody(db, {
        title: '最初', body: '本文一', notebook: await seedNotebook(db),
      })
      await pasteSourceBody(db, { sourceId: first.sourceId, title: '更新', body: '本文二' })
      await db.insert(jobs).values({
        id: 'active-job', sourceId: first.sourceId, kind: 'summarize_body', status: 'queued', createdAt: 1, updatedAt: 1,
      })
      await expect(pasteSourceBody(db, {
        sourceId: first.sourceId, title: '拒否', body: '本文三',
      })).rejects.toThrow('job_in_progress')
      const row = (await db.select().from(sources).where(eq(sources.id, first.sourceId)))[0]
      expect(row?.title).toBe('更新')
      expect(row?.body).toBe('本文二')
    } finally {
      await miniflare.dispose()
    }
  }, 30_000)
})
