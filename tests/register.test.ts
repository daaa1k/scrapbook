import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { jobs, notebooks, sources, sourceTags } from '../src/db/schema'
import { organizationCommandSchema } from '../src/domain/organization'
import { pasteSourceBody, registerUrlSource, retrySourceIngest } from '../src/server/ingest/register'
import { applyOrganizationCommand } from '../src/server/organization'
import { createTestDb } from './helpers/db'

async function organize(db: ReturnType<typeof createTestDb>['db'], input: unknown) {
  return applyOrganizationCommand(db, organizationCommandSchema.parse(input))
}

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
      mode: 'fetch',
      sourceId: result.sourceId,
      jobId: result.jobId,
      url: 'https://example.com/post',
    })

    const rows = await db.select().from(sources)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.notebookId).toBeTruthy()
    const book = (await db.select().from(notebooks).where(eq(notebooks.id, rows[0]!.notebookId)))[0]
    expect(book?.title).toBe('受信箱')
    expect(rows[0]?.memo).toBeNull()
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

  it('keeps notebook, memo, and tags when the same URL is registered again', async () => {
    const { db } = createTestDb()
    const workflow = { create: async () => ({ id: 'wf' }) }
    const first = await registerUrlSource(db, { url: 'https://example.com/keep-org' }, workflow)
    await organize(db, { type: 'create-notebook', title: '研究' })
    const researchId = (await db.select().from(notebooks).where(eq(notebooks.title, '研究')))[0]!.id
    await organize(db, { type: 'move-source', sourceId: first.sourceId, notebookId: researchId })
    await organize(db, { type: 'set-memo', sourceId: first.sourceId, memo: '残すメモ' })
    await organize(db, { type: 'attach-tag', sourceId: first.sourceId, tagName: '論文' })

    const second = await registerUrlSource(db, { url: 'https://example.com/keep-org' }, workflow)
    expect(second.duplicate).toBe(true)
    expect(second.sourceId).toBe(first.sourceId)
    const row = (await db.select().from(sources).where(eq(sources.id, first.sourceId)))[0]
    expect(row?.notebookId).toBe(researchId)
    expect(row?.memo).toBe('残すメモ')
    const tags = await db.select().from(sourceTags).where(eq(sourceTags.sourceId, first.sourceId))
    expect(tags.map((tag) => tag.tagName)).toEqual(['論文'])
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

  it('does not start a second job when a later job shares createdAt with a failed one', async () => {
    const { db } = createTestDb()
    const created: unknown[] = []
    const workflow = {
      create: async (options: { params: unknown }) => {
        created.push(options.params)
        return { id: `wf-${created.length}` }
      },
    }
    const first = await registerUrlSource(db, { url: 'https://example.com/same-created-at' }, workflow)
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
