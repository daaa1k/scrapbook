import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { jobs, sources } from '../src/db/schema'
import { pasteSourceBody, registerUrlSource, retrySourceIngest } from '../src/server/ingest/register'
import { createTestDb } from './helpers/db'

describe('register ingest', () => {
  it('creates a default notebook, source, and queued job', async () => {
    const { db } = createTestDb()
    const created: unknown[] = []
    const result = await registerUrlSource(
      db,
      { url: 'https://Example.com/post/' },
      {
        create: async (options) => {
          created.push(options.params)
          return { id: 'wf-1' }
        },
      },
    )

    expect(result.duplicate).toBe(false)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      sourceId: result.sourceId,
      jobId: result.jobId,
      url: 'https://example.com/post',
    })

    const rows = await db.select().from(sources)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.notebookId).toBeTruthy()
    expect(rows[0]?.fetchStatus).toBe('none')
    expect(rows[0]?.kind).toBe('url')
    expect(rows[0]?.acquiredVia).toBe('fetch')
    expect(rows[0]?.url).toBe('https://Example.com/post/')
    expect(rows[0]?.normalizedUrl).toBe('https://example.com/post')
  })

  it('does not create a second source for a duplicate normalized URL', async () => {
    const { db } = createTestDb()
    const workflow = { create: async () => ({ id: 'wf' }) }
    const first = await registerUrlSource(db, { url: 'https://example.com/a' }, workflow)
    const second = await registerUrlSource(db, { url: 'HTTPS://EXAMPLE.COM/a/' }, workflow)
    expect(second.duplicate).toBe(true)
    expect(second.sourceId).toBe(first.sourceId)
    expect(second.jobId).toBe(first.jobId)
    const rows = await db.select().from(sources).where(eq(sources.normalizedUrl, 'https://example.com/a'))
    expect(rows).toHaveLength(1)
  })

  it('does not start a second Cursor job while one is in flight', async () => {
    const { db } = createTestDb()
    const created: unknown[] = []
    const workflow = {
      create: async (options: { params: unknown }) => {
        created.push(options.params)
        return { id: `wf-${created.length}` }
      },
    }
    const first = await registerUrlSource(db, { url: 'https://example.com/retry' }, workflow)
    const second = await retrySourceIngest(db, first.sourceId, workflow)
    expect(second.started).toBe(false)
    expect(second.jobId).toBe(first.jobId)
    expect(created).toHaveLength(1)
  })

  it('starts a new job after the latest job has failed', async () => {
    const { db } = createTestDb()
    const created: unknown[] = []
    const workflow = {
      create: async (options: { params: unknown }) => {
        created.push(options.params)
        return { id: `wf-${created.length}` }
      },
    }
    const first = await registerUrlSource(db, { url: 'https://example.com/retry-fail' }, workflow)
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
    const pasted = await pasteSourceBody(db, { title: 'ノート', body: '手入力の本文' })
    await expect(retrySourceIngest(db, pasted.sourceId, { create: async () => ({ id: 'wf' }) })).rejects.toThrow(
      'source_has_no_url',
    )
  })

  it('does not start Cursor when the same URL is registered again after failure', async () => {
    const { db } = createTestDb()
    const created: unknown[] = []
    const workflow = {
      create: async (options: { params: unknown }) => {
        created.push(options.params)
        return { id: `wf-${created.length}` }
      },
    }
    const first = await registerUrlSource(db, { url: 'https://example.com/reregister' }, workflow)
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

    const again = await registerUrlSource(db, { url: 'https://example.com/reregister' }, workflow)
    expect(again.duplicate).toBe(true)
    expect(again.jobId).toBe(first.jobId)
    expect(created).toHaveLength(1)
  })
})
