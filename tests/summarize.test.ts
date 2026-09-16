import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { jobs, sources } from '../src/db/schema'
import { parseSummarizeResultJson } from '../src/domain/ingest-result'
import { organizationCommandSchema } from '../src/domain/organization'
import { MOCK_INGEST_JSON, createMockCursorClient } from '../src/server/cursor/client'
import { pasteSourceBody, registerUrlSource, retrySourceIngest, summarizeSourceBody } from '../src/server/ingest/register'
import { applyOrganizationCommand } from '../src/server/organization'
import { createImmediateStep, runIngestWorkflow } from '../src/server/ingest/workflow-run'
import { createTestDb } from './helpers/db'

describe('summarize from stored body', () => {
  it('writes summary from mock Cursor and leaves body and memo unchanged', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, {
      title: '手入力タイトル',
      body: '手入力の本文です。',
    })
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({
        type: 'set-memo',
        sourceId: pasted.sourceId,
        memo: '残すメモ',
      }),
    )

    const created: unknown[] = []
    const started = await summarizeSourceBody(db, pasted.sourceId, {
      create: async (options) => {
        created.push(options.params)
        return { id: 'wf-sum' }
      },
    })
    expect(started.started).toBe(true)
    expect(created).toEqual([
      { mode: 'summarize_body', jobId: started.jobId, sourceId: pasted.sourceId },
    ])

    await runIngestWorkflow({
      params: { mode: 'summarize_body', jobId: started.jobId, sourceId: pasted.sourceId },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient(),
      maxPolls: 2,
      pollSleep: 0,
    })

    const source = (await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]
    const job = (await db.select().from(jobs).where(eq(jobs.id, started.jobId)))[0]
    expect(job?.status).toBe('succeeded')
    expect(job?.kind).toBe('summarize_body')
    expect(source?.summary).toBe(MOCK_INGEST_JSON.summary)
    expect(source?.body).toBe('手入力の本文です。')
    expect(source?.title).toBe('手入力タイトル')
    expect(source?.memo).toBe('残すメモ')
    expect(source?.acquiredVia).toBe('paste')
    expect(source?.fetchStatus).toBe('full')
  })

  it('keeps extra keys on mock ingest JSON when parsing a summary', () => {
    expect(parseSummarizeResultJson(JSON.stringify(MOCK_INGEST_JSON))).toEqual({ summary: 'モック要約' })
  })

  it('rejects an empty or whitespace body without inserting a job', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, { title: '空', body: 'いったん本文' })
    await db.update(sources).set({ body: '   ' }).where(eq(sources.id, pasted.sourceId))

    await expect(
      summarizeSourceBody(db, pasted.sourceId, { create: async () => ({ id: 'wf' }) }),
    ).rejects.toThrow('source_has_no_body')

    const jobRows = await db.select().from(jobs).where(eq(jobs.sourceId, pasted.sourceId))
    expect(jobRows).toHaveLength(0)

    await db.update(sources).set({ body: null }).where(eq(sources.id, pasted.sourceId))
    await expect(
      summarizeSourceBody(db, pasted.sourceId, { create: async () => ({ id: 'wf' }) }),
    ).rejects.toThrow('source_has_no_body')
  })

  it('does not start a second job while fetch or summarize is in flight', async () => {
    const { db } = createTestDb()
    const created: unknown[] = []
    const workflow = {
      create: async (options: { params: unknown }) => {
        created.push(options.params)
        return { id: `wf-${created.length}` }
      },
    }

    const registered = await registerUrlSource(db, { url: 'https://example.com/busy-sum' }, workflow)
    await db.update(sources).set({ body: '取得前の下書き' }).where(eq(sources.id, registered.sourceId))
    const duringFetch = await summarizeSourceBody(db, registered.sourceId, workflow)
    expect(duringFetch.started).toBe(false)
    expect(duringFetch.jobId).toBe(registered.jobId)
    expect(created).toHaveLength(1)

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

    const first = await summarizeSourceBody(db, registered.sourceId, workflow)
    expect(first.started).toBe(true)
    const second = await summarizeSourceBody(db, registered.sourceId, workflow)
    expect(second.started).toBe(false)
    expect(second.jobId).toBe(first.jobId)
    expect(created).toHaveLength(2)
  })

  it('does not treat summarize as URL retry', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, { title: 'ノート', body: '手入力の本文' })
    await expect(retrySourceIngest(db, pasted.sourceId, { create: async () => ({ id: 'wf' }) })).rejects.toThrow(
      'source_has_no_url',
    )
    const summarized = await summarizeSourceBody(db, pasted.sourceId, { create: async () => ({ id: 'wf' }) })
    expect(summarized.started).toBe(true)
    const job = (await db.select().from(jobs).where(eq(jobs.id, summarized.jobId)))[0]
    expect(job?.kind).toBe('summarize_body')
  })
})
