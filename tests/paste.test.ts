import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { jobs, notebooks, sources, sourceTags } from '../src/db/schema'
import { organizationCommandSchema } from '../src/domain/organization'
import { pasteSourceBody, registerUrlSource } from '../src/server/ingest/register'
import { applyOrganizationCommand } from '../src/server/organization'
import { createTestDb } from './helpers/db'

async function organize(db: ReturnType<typeof createTestDb>['db'], input: unknown) {
  return applyOrganizationCommand(db, organizationCommandSchema.parse(input))
}

describe('paste source body', () => {
  it('persists title and body without starting Cursor', async () => {
    const { db } = createTestDb()
    const result = await pasteSourceBody(db, {
      title: '手入力タイトル',
      body: '手入力の本文です。',
    })

    const row = (await db.select().from(sources).where(eq(sources.id, result.sourceId)))[0]
    const jobRows = await db.select().from(jobs).where(eq(jobs.sourceId, result.sourceId))
    const book = (await db.select().from(notebooks).where(eq(notebooks.id, row!.notebookId)))[0]
    expect(row?.title).toBe('手入力タイトル')
    expect(row?.body).toBe('手入力の本文です。')
    expect(row?.summary).toBeNull()
    expect(row?.memo).toBeNull()
    expect(book?.title).toBe('受信箱')
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

    await organize(db, { type: 'set-memo', sourceId: registered.sourceId, memo: '残すメモ' })
    await db
      .update(sources)
      .set({ summary: '取得した要約' })
      .where(eq(sources.id, registered.sourceId))

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
    expect(row?.memo).toBe('残すメモ')
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

  it('keeps notebook, memo, and tags on a URL-bearing paste of an existing source', async () => {
    const { db } = createTestDb()
    const first = await pasteSourceBody(db, {
      title: '初回',
      body: '初回本文',
      url: 'https://example.com/paste-url',
    })
    await organize(db, { type: 'create-notebook', title: '研究' })
    const researchId = (await db.select().from(notebooks).where(eq(notebooks.title, '研究')))[0]!.id
    await organize(db, { type: 'move-source', sourceId: first.sourceId, notebookId: researchId })
    await organize(db, { type: 'set-memo', sourceId: first.sourceId, memo: '残すメモ' })
    await organize(db, { type: 'attach-tag', sourceId: first.sourceId, tagName: '論文' })

    const again = await pasteSourceBody(db, {
      title: '二回目',
      body: '二回目本文',
      url: 'https://example.com/paste-url',
    })
    expect(again.sourceId).toBe(first.sourceId)
    const row = (await db.select().from(sources).where(eq(sources.id, first.sourceId)))[0]
    expect(row?.title).toBe('二回目')
    expect(row?.body).toBe('二回目本文')
    expect(row?.summary).toBeNull()
    expect(row?.memo).toBe('残すメモ')
    expect(row?.notebookId).toBe(researchId)
    const tags = await db.select().from(sourceTags).where(eq(sourceTags.sourceId, first.sourceId))
    expect(tags.map((tag) => tag.tagName)).toEqual(['論文'])
  })
})
