import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { citations, jobs, qaAnswers, qaCitations, sources } from '../src/db/schema'
import { parseAskResultJson } from '../src/domain/ingest-result'
import { MOCK_ASK_JSON, MOCK_INGEST_JSON, createMockCursorClient } from '../src/server/cursor/client'
import {
  askSourceQuestion,
  deleteQaAnswer,
  summarizeSourceBody,
} from '../src/server/ingest/register'
import { pasteSourceBody, registerUrlSource } from './helpers/ingest'
import { createImmediateStep, runIngestWorkflow } from '../src/server/ingest/workflow-run'
import { readSourceDetail } from '../src/server/source-views'
import { createTestDb } from './helpers/db'

describe('ask source from stored body', () => {
  it('persists answer and qa citations without touching source citations', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, {
      title: '手入力タイトル',
      body: 'これはモックの本文です。',
    })
    await db.insert(citations).values({
      id: 'cite-keep',
      sourceId: pasted.sourceId,
      locator: '0:3',
      excerpt: 'これ',
      createdAt: Date.now(),
    })

    const created: unknown[] = []
    const started = await askSourceQuestion(db, pasted.sourceId, '要点は？', {
      create: async (options) => {
        created.push(options.params)
        return { id: 'wf-ask' }
      },
    })
    expect(started.started).toBe(true)
    expect(created).toEqual([
      {
        mode: 'ask_source',
        jobId: started.jobId,
        sourceId: pasted.sourceId,
        qaAnswerId: expect.any(String),
      },
    ])
    const qaAnswerId = (created[0] as { qaAnswerId: string }).qaAnswerId

    await runIngestWorkflow({
      params: {
        mode: 'ask_source',
        jobId: started.jobId,
        sourceId: pasted.sourceId,
        qaAnswerId,
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({ result: JSON.stringify(MOCK_ASK_JSON) }),
      maxPolls: 2,
      pollSleep: 0,
    })

    const job = (await db.select().from(jobs).where(eq(jobs.id, started.jobId)))[0]
    const answer = (await db.select().from(qaAnswers).where(eq(qaAnswers.id, qaAnswerId)))[0]
    const qaCiteRows = await db.select().from(qaCitations).where(eq(qaCitations.qaAnswerId, qaAnswerId))
    const sourceCiteRows = await db.select().from(citations).where(eq(citations.sourceId, pasted.sourceId))
    const source = (await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]

    expect(job?.status).toBe('succeeded')
    expect(job?.kind).toBe('ask_source')
    expect(answer?.question).toBe('要点は？')
    expect(answer?.answer).toBe(MOCK_ASK_JSON.answer)
    expect(qaCiteRows).toHaveLength(1)
    expect(qaCiteRows[0]?.excerpt).toBe('モックの本文')
    expect(sourceCiteRows).toEqual([
      expect.objectContaining({ id: 'cite-keep', excerpt: 'これ' }),
    ])
    expect(source?.summary).toBeNull()
    expect(source?.body).toBe('これはモックの本文です。')

    const detail = await readSourceDetail(db, pasted.sourceId)
    expect(detail.qaAnswers).toHaveLength(1)
    expect(detail.qaAnswers[0]?.answer).toBe(MOCK_ASK_JSON.answer)
    expect(detail.qaAnswers[0]?.canDelete).toBe(true)
    expect(detail.qaAnswers[0]?.citations[0]?.bodySpan).toEqual({ start: 3, end: 9 })
    expect(detail.citations).toHaveLength(1)
  })

  it('deletes a terminal turn and its citations; rejects in-flight deletes', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, {
      title: '手入力タイトル',
      body: 'これはモックの本文です。',
    })
    const created: unknown[] = []
    const started = await askSourceQuestion(db, pasted.sourceId, '消す質問', {
      create: async (options) => {
        created.push(options.params)
        return { id: 'wf-ask-del' }
      },
    })
    const qaAnswerId = (created[0] as { qaAnswerId: string }).qaAnswerId

    await expect(
      deleteQaAnswer(db, { sourceId: pasted.sourceId, qaAnswerId }),
    ).rejects.toThrow('qa_answer_in_progress')

    const detailInFlight = await readSourceDetail(db, pasted.sourceId)
    expect(detailInFlight.qaAnswers[0]?.canDelete).toBe(false)

    await runIngestWorkflow({
      params: {
        mode: 'ask_source',
        jobId: started.jobId,
        sourceId: pasted.sourceId,
        qaAnswerId,
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({ result: JSON.stringify(MOCK_ASK_JSON) }),
      maxPolls: 2,
      pollSleep: 0,
    })

    await deleteQaAnswer(db, { sourceId: pasted.sourceId, qaAnswerId })
    expect(await db.select().from(qaAnswers)).toHaveLength(0)
    expect(await db.select().from(qaCitations)).toHaveLength(0)

    const after = await askSourceQuestion(db, pasted.sourceId, '次の質問', {
      create: async () => ({ id: 'wf-ask-next' }),
    })
    expect(after.started).toBe(true)
  })

  it('rejects delete for the wrong source or unknown id', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, { title: 't', body: 'これはモックの本文です。' })
    const created: unknown[] = []
    const started = await askSourceQuestion(db, pasted.sourceId, '質問', {
      create: async (options) => {
        created.push(options.params)
        return { id: 'wf' }
      },
    })
    const qaAnswerId = (created[0] as { qaAnswerId: string }).qaAnswerId
    await runIngestWorkflow({
      params: {
        mode: 'ask_source',
        jobId: started.jobId,
        sourceId: pasted.sourceId,
        qaAnswerId,
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({ result: JSON.stringify(MOCK_ASK_JSON) }),
      maxPolls: 2,
      pollSleep: 0,
    })

    await expect(deleteQaAnswer(db, { sourceId: 'missing', qaAnswerId })).rejects.toThrow(
      'qa_answer_not_found',
    )
    await expect(
      deleteQaAnswer(db, { sourceId: pasted.sourceId, qaAnswerId: 'missing' }),
    ).rejects.toThrow('qa_answer_not_found')
  })

  it('parses ask JSON and rejects empty questions without a job', async () => {
    expect(parseAskResultJson(JSON.stringify(MOCK_ASK_JSON))).toEqual({
      answer: 'モック回答です。',
      citations: [{ excerpt: 'モックの本文', locator: { kind: 'offsets', start: 3, end: 9 } }],
    })

    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, { title: 't', body: 'body text' })
    await expect(
      askSourceQuestion(db, pasted.sourceId, '   ', { create: async () => ({ id: 'wf' }) }),
    ).rejects.toThrow('question_empty')
    expect(await db.select().from(jobs)).toHaveLength(0)
    expect(await db.select().from(qaAnswers)).toHaveLength(0)
  })

  it('leaves answer null when Cursor fails and does not clear source citations', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, {
      title: 't',
      body: 'これはモックの本文です。',
    })
    await db.insert(citations).values({
      id: 'cite-keep-2',
      sourceId: pasted.sourceId,
      locator: '-',
      excerpt: '残す',
      createdAt: Date.now(),
    })

    const created: unknown[] = []
    const started = await askSourceQuestion(db, pasted.sourceId, '失敗する質問', {
      create: async (options) => {
        created.push(options.params)
        return { id: 'wf-ask-fail' }
      },
    })
    const qaAnswerId = (created[0] as { qaAnswerId: string }).qaAnswerId

    await runIngestWorkflow({
      params: {
        mode: 'ask_source',
        jobId: started.jobId,
        sourceId: pasted.sourceId,
        qaAnswerId,
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({ runStatus: 'ERROR' }),
      maxPolls: 2,
      pollSleep: 0,
    })

    const job = (await db.select().from(jobs).where(eq(jobs.id, started.jobId)))[0]
    const answer = (await db.select().from(qaAnswers).where(eq(qaAnswers.id, qaAnswerId)))[0]
    const qaCiteRows = await db.select().from(qaCitations).where(eq(qaCitations.qaAnswerId, qaAnswerId))
    const sourceCiteRows = await db.select().from(citations).where(eq(citations.sourceId, pasted.sourceId))

    expect(job?.status).toBe('failed')
    expect(answer?.answer).toBeNull()
    expect(qaCiteRows).toHaveLength(0)
    expect(sourceCiteRows).toHaveLength(1)
  })

  it('does not start ask while another job is in flight', async () => {
    const { db } = createTestDb()
    const workflow = {
      create: async () => ({ id: 'wf' }),
    }
    const registered = await registerUrlSource(db, { url: 'https://example.com/ask-busy' }, workflow)
    await db.update(sources).set({ body: '下書き本文' }).where(eq(sources.id, registered.sourceId))

    const duringFetch = await askSourceQuestion(db, registered.sourceId, '今は無理？', workflow)
    expect(duringFetch.started).toBe(false)
    expect(duringFetch.jobId).toBe(registered.jobId)
    expect(await db.select().from(qaAnswers)).toHaveLength(0)

    await db
      .update(jobs)
      .set({
        status: 'failed',
        errorCode: 'timeout',
        errorMessage: 'done',
        finishedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(jobs.id, registered.jobId))

    const first = await askSourceQuestion(db, registered.sourceId, '一回目', workflow)
    expect(first.started).toBe(true)
    const second = await askSourceQuestion(db, registered.sourceId, '二回目', workflow)
    expect(second.started).toBe(false)
    expect(second.jobId).toBe(first.jobId)
    expect(await db.select().from(qaAnswers)).toHaveLength(1)
  })

  it('rejects ask without a body and does not confuse ask with summarize', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, { title: '空', body: 'いったん' })
    await db.update(sources).set({ body: null }).where(eq(sources.id, pasted.sourceId))
    await expect(
      askSourceQuestion(db, pasted.sourceId, '質問', { create: async () => ({ id: 'wf' }) }),
    ).rejects.toThrow('source_has_no_body')

    await db.update(sources).set({ body: '戻した本文' }).where(eq(sources.id, pasted.sourceId))
    const summarized = await summarizeSourceBody(db, pasted.sourceId, {
      create: async () => ({ id: 'wf-sum' }),
    })
    expect(summarized.started).toBe(true)
    const sumJob = (await db.select().from(jobs).where(eq(jobs.id, summarized.jobId)))[0]
    expect(sumJob?.kind).toBe('summarize_body')
  })

  it('ignores ingest-shaped mock JSON when asking unless answer is present', () => {
    expect(() => parseAskResultJson(JSON.stringify(MOCK_INGEST_JSON))).toThrow()
  })
})
