import { eq } from 'drizzle-orm'
import { Miniflare } from 'miniflare'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import { jobs, notebooks, sources, sourceTags } from '../src/db/schema'
import { organizationCommandSchema } from '../src/domain/organization'
import { pasteSourceBody, registerUrlSource, retrySourceIngest } from '../src/server/ingest/register'
import { applyOrganizationCommand } from '../src/server/organization'
import { createTestDb, migrationStatements } from './helpers/db'
import { seedNotebook } from './helpers/notebook'

async function organize(db: ReturnType<typeof createTestDb>['db'], input: unknown) {
  return applyOrganizationCommand(db, organizationCommandSchema.parse(input))
}

describe('register ingest', () => {
  it('creates a source in the given notebook and a queued job', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const created: unknown[] = []
    const result = await registerUrlSource(
      db,
      { url: 'https://Example.com/post/', notebook: notebookId },
      {
        create: async (options) => {
          created.push(options.params)
          return { id: 'wf-1' }
        },
      },
    )

    expect(result.duplicate).toBe(false)
    expect(result.notebookId).toBe(notebookId)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      mode: 'fetch',
      sourceId: result.sourceId,
      jobId: result.jobId,
      url: 'https://example.com/post',
    })

    const rows = await db.select().from(sources)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.notebookId).toBeTruthy()
    const book = (await db.select().from(notebooks).where(eq(notebooks.id, rows[0]!.notebookId)))[0]
    expect(book?.title).toBe('研究')
    expect(rows[0]?.memo).toBeNull()
    expect(rows[0]?.fetchStatus).toBe('none')
    expect(rows[0]?.kind).toBe('url')
    expect(rows[0]?.acquiredVia).toBe('fetch')
    expect(rows[0]?.url).toBe('https://Example.com/post/')
    expect(rows[0]?.normalizedUrl).toBe('https://example.com/post')
  })

  it('does not create a second source for a duplicate normalized URL', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const workflow = { create: async () => ({ id: 'wf' }) }
    const first = await registerUrlSource(db, { url: 'https://example.com/a', notebook: notebookId }, workflow)
    const second = await registerUrlSource(db, { url: 'HTTPS://EXAMPLE.COM/a/', notebook: notebookId }, workflow)
    expect(second.duplicate).toBe(true)
    expect(second.sourceId).toBe(first.sourceId)
    expect(second.jobId).toBe(first.jobId)
    const rows = await db.select().from(sources).where(eq(sources.normalizedUrl, 'https://example.com/a'))
    expect(rows).toHaveLength(1)
  })

  it('converges concurrent registrations after both title fetches have started', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    let release!: () => void
    const barrier = new Promise<void>((resolve) => { release = resolve })
    let bothFetching!: () => void
    const entered = new Promise<void>((resolve) => { bothFetching = resolve })
    let fetches = 0
    const fetchImpl: typeof fetch = async () => {
      if (++fetches === 2) bothFetching()
      await barrier
      return new Response('<title>Concurrent</title>', { headers: { 'content-type': 'text/html' } })
    }
    const created: unknown[] = []
    const workflow = { create: async (options: { params: unknown }) => {
      created.push(options.params)
      return { id: 'wf' }
    } }
    const input = { url: 'https://example.com/concurrent', notebook: notebookId }
    const first = registerUrlSource(db, input, workflow, { fetchImpl })
    const second = registerUrlSource(db, input, workflow, { fetchImpl })
    await entered
    release()
    const results = await Promise.all([first, second])

    expect(results.map((result) => result.duplicate).sort()).toEqual([false, true])
    expect(new Set(results.map((result) => result.sourceId)).size).toBe(1)
    expect(new Set(results.map((result) => result.jobId)).size).toBe(1)
    expect(await db.select().from(sources)).toHaveLength(1)
    expect(await db.select().from(jobs)).toHaveLength(1)
    expect(created).toHaveLength(1)
  })

  it('converges concurrent registrations of an existing source without a job', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const input = { url: 'https://example.com/no-job', notebook: notebookId }
    const original = await registerUrlSource(db, input, { create: async () => ({ id: 'initial' }) })
    await db.delete(jobs).where(eq(jobs.id, original.jobId))
    const created: unknown[] = []
    const workflow = { create: async (options: { params: unknown }) => {
      created.push(options.params)
      return { id: 'wf' }
    } }

    const results = await Promise.all([
      registerUrlSource(db, input, workflow),
      registerUrlSource(db, input, workflow),
    ])
    expect(results.every((result) => result.duplicate)).toBe(true)
    expect(results.map((result) => result.sourceId)).toEqual([original.sourceId, original.sourceId])
    expect(new Set(results.map((result) => result.jobId)).size).toBe(1)
    expect(await db.select().from(jobs)).toHaveLength(1)
    expect(created).toHaveLength(1)
  })

  it('converges both URL and job conflicts on local D1', async () => {
    const miniflare = new Miniflare({
      workers: [{ config: {
        name: 'test', type: 'worker', compatibilityDate: '2026-09-15',
        manifest: { mainModule: 'index.js', modules: {
          'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' },
        } },
        env: { DB: { type: 'd1', name: 'register-test-db' } },
      } }],
    })
    try {
      const d1 = await miniflare.getD1Database('DB')
      for (const statement of migrationStatements()) await d1.prepare(statement).run()
      const db = createDb(d1)
      const notebook = await seedNotebook(db)
      let release!: () => void
      const barrier = new Promise<void>((resolve) => { release = resolve })
      let bothFetching!: () => void
      const entered = new Promise<void>((resolve) => { bothFetching = resolve })
      let fetches = 0
      const fetchImpl: typeof fetch = async () => {
        if (++fetches === 2) bothFetching()
        await barrier
        return new Response('<title>D1</title>', { headers: { 'content-type': 'text/html' } })
      }
      const starts: unknown[] = []
      const workflow = { create: async (options: { params: unknown }) => {
        starts.push(options.params)
        return { id: 'wf' }
      } }
      const input = { url: 'https://example.com/d1-concurrent', notebook }
      const requests = [
        registerUrlSource(db, input, workflow, { fetchImpl }),
        registerUrlSource(db, input, workflow, { fetchImpl }),
      ]
      await entered
      release()
      const results = await Promise.all(requests)
      expect(new Set(results.map((result) => result.sourceId)).size).toBe(1)
      expect(new Set(results.map((result) => result.jobId)).size).toBe(1)
      expect(starts).toHaveLength(1)

      await db.delete(jobs).where(eq(jobs.sourceId, results[0]!.sourceId))
      const reused = await Promise.all([
        registerUrlSource(db, input, workflow),
        registerUrlSource(db, input, workflow),
      ])
      expect(new Set(reused.map((result) => result.jobId)).size).toBe(1)
      expect(await db.select().from(jobs)).toHaveLength(1)
      expect(starts).toHaveLength(2)
    } finally {
      await miniflare.dispose()
    }
  }, 30_000)

  it('keeps memo and tags when the same URL is registered again in the same notebook', async () => {
    const { db } = createTestDb()
    const originId = await seedNotebook(db, '元')
    const workflow = { create: async () => ({ id: 'wf' }) }
    const first = await registerUrlSource(db, { url: 'https://example.com/keep-org', notebook: originId }, workflow)
    await organize(db, { type: 'set-memo', sourceId: first.sourceId, memo: '残すメモ' })
    await organize(db, { type: 'attach-tag', sourceId: first.sourceId, tagName: '論文' })

    const second = await registerUrlSource(db, { url: 'https://example.com/keep-org', notebook: originId }, workflow)
    expect(second.duplicate).toBe(true)
    expect(second.sourceId).toBe(first.sourceId)
    expect(second.notebookId).toBe(originId)
    const row = (await db.select().from(sources).where(eq(sources.id, first.sourceId)))[0]
    expect(row?.notebookId).toBe(originId)
    expect(row?.memo).toBe('残すメモ')
    const tags = await db.select().from(sourceTags).where(eq(sourceTags.sourceId, first.sourceId))
    expect(tags.map((tag) => tag.tagName)).toEqual(['論文'])
  })

  it('rejects a URL that already lives in another notebook', async () => {
    const { db } = createTestDb()
    const originId = await seedNotebook(db, '元')
    const workflow = { create: async () => ({ id: 'wf' }) }
    const first = await registerUrlSource(db, { url: 'https://example.com/keep-org', notebook: originId }, workflow)
    const researchId = await seedNotebook(db, '研究')
    await organize(db, { type: 'move-source', sourceId: first.sourceId, notebookId: researchId })

    await expect(
      registerUrlSource(db, { url: 'https://example.com/keep-org', notebook: originId }, workflow),
    ).rejects.toThrow('source_already_registered')
    const row = (await db.select().from(sources).where(eq(sources.id, first.sourceId)))[0]
    expect(row?.notebookId).toBe(researchId)
  })

  it('does not start a second Cursor job while one is in flight', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const created: unknown[] = []
    const workflow = {
      create: async (options: { params: unknown }) => {
        created.push(options.params)
        return { id: `wf-${created.length}` }
      },
    }
    const first = await registerUrlSource(db, { url: 'https://example.com/retry', notebook: notebookId }, workflow)
    const second = await retrySourceIngest(db, first.sourceId, workflow)
    expect(second.started).toBe(false)
    expect(second.jobId).toBe(first.jobId)
    expect(created).toHaveLength(1)
  })

  it('does not start a second job when a later job shares createdAt with a failed one', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const created: unknown[] = []
    const workflow = {
      create: async (options: { params: unknown }) => {
        created.push(options.params)
        return { id: `wf-${created.length}` }
      },
    }
    const first = await registerUrlSource(db, { url: 'https://example.com/same-created-at', notebook: notebookId }, workflow)
    const firstJob = (await db.select().from(jobs).where(eq(jobs.id, first.jobId)))[0]!
    await db
      .update(jobs)
      .set({
        status: 'failed',
        errorCode: 'cursor_run_failed',
        errorMessage: 'Cursor run ended: ERROR',
        finishedAt: firstJob.createdAt,
        updatedAt: firstJob.createdAt,
      })
      .where(eq(jobs.id, first.jobId))

    const queuedId = crypto.randomUUID()
    await db.insert(jobs).values({
      id: queuedId,
      sourceId: first.sourceId,
      status: 'queued',
      cursorAgentId: null,
      errorCode: null,
      errorMessage: null,
      attemptCount: 1,
      createdAt: firstJob.createdAt,
      updatedAt: firstJob.createdAt,
      startedAt: null,
      finishedAt: null,
    })

    const again = await retrySourceIngest(db, first.sourceId, workflow)
    expect(again.started).toBe(false)
    expect(again.jobId).toBe(queuedId)
    expect(created).toHaveLength(1)
  })

  it('starts a new job after the latest job has failed', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const created: unknown[] = []
    const workflow = {
      create: async (options: { params: unknown }) => {
        created.push(options.params)
        return { id: `wf-${created.length}` }
      },
    }
    const first = await registerUrlSource(db, { url: 'https://example.com/retry-fail', notebook: notebookId }, workflow)
    await db
      .update(jobs)
      .set({
        status: 'failed',
        errorCode: 'cursor_run_failed',
        errorMessage: 'Cursor run ended: ERROR',
        finishedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(jobs.id, first.jobId))

    const retried = await retrySourceIngest(db, first.sourceId, workflow)
    expect(retried.started).toBe(true)
    expect(retried.jobId).not.toBe(first.jobId)
    expect(created).toHaveLength(2)

    const again = await retrySourceIngest(db, first.sourceId, workflow)
    expect(again.started).toBe(false)
    expect(again.jobId).toBe(retried.jobId)
    expect(created).toHaveLength(2)
  })

  it('rejects retry when the source has no URL', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const pasted = await pasteSourceBody(db, { title: 'ノート', body: '手入力の本文', notebook: notebookId })
    await expect(retrySourceIngest(db, pasted.sourceId, { create: async () => ({ id: 'wf' }) })).rejects.toThrow(
      'source_has_no_url',
    )
  })

  it('does not start Cursor when the same URL is registered again after failure', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const created: unknown[] = []
    const workflow = {
      create: async (options: { params: unknown }) => {
        created.push(options.params)
        return { id: `wf-${created.length}` }
      },
    }
    const first = await registerUrlSource(db, { url: 'https://example.com/reregister', notebook: notebookId }, workflow)
    await db
      .update(jobs)
      .set({
        status: 'failed',
        errorCode: 'timeout',
        errorMessage: 'Cursor run ended: RUNNING',
        finishedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(jobs.id, first.jobId))

    const again = await registerUrlSource(db, { url: 'https://example.com/reregister', notebook: notebookId }, workflow)
    expect(again.duplicate).toBe(true)
    expect(again.jobId).toBe(first.jobId)
    expect(created).toHaveLength(1)
  })
})
