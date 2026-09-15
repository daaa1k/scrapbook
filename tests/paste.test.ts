import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { jobs, sources } from '../src/db/schema'
import { pasteSourceBody, registerUrlSource } from '../src/server/ingest/register'
import { createTestDb } from './helpers/db'

describe('paste source body', () => {
  it('persists title and body without starting Cursor', async () => {
    const { db } = createTestDb()
    const result = await pasteSourceBody(db, {
      title: '手入力タイトル',
      body: '手入力の本文です。',
    })

    const row = (await db.select().from(sources).where(eq(sources.id, result.sourceId)))[0]
    const jobRows = await db.select().from(jobs).where(eq(jobs.sourceId, result.sourceId))
    expect(row?.title).toBe('手入力タイトル')
    expect(row?.body).toBe('手入力の本文です。')
    expect(row?.summary).toBeNull()
    expect(row?.fetchStatus).toBe('full')
    expect(row?.acquiredVia).toBe('paste')
    expect(row?.contentHash).toBeTruthy()
    expect(jobRows).toHaveLength(0)
  })

  it('updates an existing failed source without a workflow binding', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/paste-over' }, {
      create: async () => ({ id: 'wf' }),
    })
    await db
      .update(jobs)
      .set({
        status: 'failed',
        errorCode: 'timeout',
        errorMessage: 'Cursor run ended: RUNNING',
        finishedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(jobs.id, registered.jobId))

    const pasted = await pasteSourceBody(db, {
      sourceId: registered.sourceId,
      title: '貼り付け後',
      body: '失敗したので本文を入れた',
    })
    expect(pasted.sourceId).toBe(registered.sourceId)

    const row = (await db.select().from(sources).where(eq(sources.id, registered.sourceId)))[0]
    expect(row?.title).toBe('貼り付け後')
    expect(row?.body).toBe('失敗したので本文を入れた')
    expect(row?.summary).toBeNull()
    expect(row?.acquiredVia).toBe('paste')
    expect(row?.url).toBe('https://example.com/paste-over')
  })

  it('refuses paste while a job is in flight', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/busy' }, {
      create: async () => ({ id: 'wf' }),
    })
    await expect(
      pasteSourceBody(db, {
        sourceId: registered.sourceId,
        title: '早すぎる',
        body: '処理中',
      }),
    ).rejects.toThrow('job_in_progress')
  })
})
