import { readFileSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { citations } from '../src/db/schema'
import { parseIngestResultJson } from '../src/domain/ingest-result'
import { sourceDetailSchema, sourceListItemSchema } from '../src/domain/source-views'
import { authenticateAccessRequest } from '../src/server/auth/access'
import { MOCK_INGEST_JSON, createMockCursorClient } from '../src/server/cursor/client'
import { retrySourceIngest, summarizeSourceBody } from '../src/server/ingest/register'
import { pasteSourceBody, registerUrlSource } from './helpers/ingest'
import { createImmediateStep, runIngestWorkflow } from '../src/server/ingest/workflow-run'
import { readSourceDetail } from '../src/server/source-views'
import { createTestDb } from './helpers/db'

const workflow = { create: async () => ({ id: 'wf' }) }

const detailFixture = {
  id: 'source-1',
  kind: 'url',
  url: 'https://example.com/a',
  title: 't',
  author: null,
  fetchStatus: 'full',
  acquiredVia: 'fetch' as const,
  summary: null,
  body: null,
  job: null,
  organization: {
    notebook: {
      id: '11111111-1111-4111-8111-111111111111',
      title: '受信箱',
    },
    tags: [],
    memo: null,
  },
}

describe('source citations', () => {
  it('rejects lone, reversed, or negative citation offsets', () => {
    const base = { ...MOCK_INGEST_JSON }
    expect(() =>
      parseIngestResultJson(JSON.stringify({ ...base, citations: [{ excerpt: '残す', start: 1 }] })),
    ).toThrow()
    expect(() =>
      parseIngestResultJson(JSON.stringify({ ...base, citations: [{ excerpt: '残す', start: 5, end: 5 }] })),
    ).toThrow()
    expect(() =>
      parseIngestResultJson(JSON.stringify({ ...base, citations: [{ excerpt: '残す', start: -1, end: 2 }] })),
    ).toThrow()
  })

  it('persists the mock fetch citation and derives bodySpan on detail', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/ok' }, workflow)

    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: registered.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/ok',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient(),
      maxPolls: 2,
      pollSleep: 0,
    })

    const rows = await db.select().from(citations).where(eq(citations.sourceId, registered.sourceId))
    expect(rows).toEqual([
      {
        id: rows[0]!.id,
        sourceId: registered.sourceId,
        locator: '3:9',
        excerpt: 'モックの本文',
        createdAt: rows[0]!.createdAt,
      },
    ])

    const detail = await readSourceDetail(db, registered.sourceId)
    expect(detail.citations).toEqual([
      {
        id: detail.citations[0]!.id,
        excerpt: 'モックの本文',
        bodySpan: { start: 3, end: 9 },
      },
    ])
  })

  it('replaces the snapshot on a later summarize instead of appending', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/replace' }, workflow)

    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: registered.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/replace',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient(),
      maxPolls: 2,
      pollSleep: 0,
    })

    const started = await summarizeSourceBody(db, registered.sourceId, workflow)
    expect(started.started).toBe(true)

    await runIngestWorkflow({
      params: { mode: 'summarize_body', jobId: started.jobId, sourceId: registered.sourceId },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({
        result: JSON.stringify({ ...MOCK_INGEST_JSON, citations: [{ excerpt: '別の引用' }] }),
      }),
      maxPolls: 2,
      pollSleep: 0,
    })

    const rows = await db.select().from(citations).where(eq(citations.sourceId, registered.sourceId))
    expect(rows).toEqual([
      {
        id: rows[0]!.id,
        sourceId: registered.sourceId,
        locator: '-',
        excerpt: '別の引用',
        createdAt: rows[0]!.createdAt,
      },
    ])
  })

  it('clears rows when citations is [] or omitted after a success', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/clear' }, workflow)

    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: registered.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/clear',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient(),
      maxPolls: 2,
      pollSleep: 0,
    })

    const emptied = await retrySourceIngest(db, registered.sourceId, workflow)
    expect(emptied.started).toBe(true)
    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: emptied.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/clear',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({
        result: JSON.stringify({ ...MOCK_INGEST_JSON, citations: [] }),
      }),
      maxPolls: 2,
      pollSleep: 0,
    })
    expect(await db.select().from(citations).where(eq(citations.sourceId, registered.sourceId))).toEqual([])

    const restored = await retrySourceIngest(db, registered.sourceId, workflow)
    expect(restored.started).toBe(true)
    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: restored.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/clear',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient(),
      maxPolls: 2,
      pollSleep: 0,
    })
    const restoredRows = await db.select().from(citations).where(eq(citations.sourceId, registered.sourceId))
    expect(restoredRows).toEqual([
      {
        id: restoredRows[0]!.id,
        sourceId: registered.sourceId,
        locator: '3:9',
        excerpt: 'モックの本文',
        createdAt: restoredRows[0]!.createdAt,
      },
    ])

    const omitted = await retrySourceIngest(db, registered.sourceId, workflow)
    expect(omitted.started).toBe(true)
    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: omitted.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/clear',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({
        result: JSON.stringify({
          title: MOCK_INGEST_JSON.title,
          author: MOCK_INGEST_JSON.author,
          publishedAt: MOCK_INGEST_JSON.publishedAt,
          body: MOCK_INGEST_JSON.body,
          summary: MOCK_INGEST_JSON.summary,
          fetchStatus: MOCK_INGEST_JSON.fetchStatus,
          failureReason: MOCK_INGEST_JSON.failureReason,
        }),
      }),
      maxPolls: 2,
      pollSleep: 0,
    })
    expect(await db.select().from(citations).where(eq(citations.sourceId, registered.sourceId))).toEqual([])
  })

  it('inserts an unanchored citation when body is empty and bodySpan stays null', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/empty-body' }, workflow)

    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: registered.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/empty-body',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({
        result: JSON.stringify({
          ...MOCK_INGEST_JSON,
          body: '',
          citations: [{ excerpt: '残す' }],
        }),
      }),
      maxPolls: 2,
      pollSleep: 0,
    })

    const rows = await db.select().from(citations).where(eq(citations.sourceId, registered.sourceId))
    expect(rows).toEqual([
      {
        id: rows[0]!.id,
        sourceId: registered.sourceId,
        locator: '-',
        excerpt: '残す',
        createdAt: rows[0]!.createdAt,
      },
    ])

    const detail = await readSourceDetail(db, registered.sourceId)
    expect(detail.citations).toEqual([
      {
        id: detail.citations[0]!.id,
        excerpt: '残す',
        bodySpan: null,
      },
    ])
  })

  it('leaves seeded rows in place when the Cursor run errors', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/error' }, workflow)
    await db.insert(citations).values({
      id: 'seed-error',
      sourceId: registered.sourceId,
      locator: '3:9',
      excerpt: 'モックの本文',
      createdAt: 1,
    })

    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: registered.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/error',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({ runStatus: 'ERROR' }),
      maxPolls: 2,
      pollSleep: 0,
    })

    expect(await db.select().from(citations).where(eq(citations.sourceId, registered.sourceId))).toEqual([
      {
        id: 'seed-error',
        sourceId: registered.sourceId,
        locator: '3:9',
        excerpt: 'モックの本文',
        createdAt: 1,
      },
    ])
  })

  it('leaves seeded rows in place on paste and drops bodySpan when the body no longer matches', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, {
      title: '元',
      body: 'これはモックの本文です。',
    })
    await db.insert(citations).values({
      id: 'seed-paste',
      sourceId: pasted.sourceId,
      locator: '3:9',
      excerpt: 'モックの本文',
      createdAt: 1,
    })

    const matching = await readSourceDetail(db, pasted.sourceId)
    expect(matching.citations).toEqual([
      {
        id: 'seed-paste',
        excerpt: 'モックの本文',
        bodySpan: { start: 3, end: 9 },
      },
    ])

    await pasteSourceBody(db, {
      sourceId: pasted.sourceId,
      title: '後',
      body: '一致しない本文',
    })

    expect(await db.select().from(citations).where(eq(citations.sourceId, pasted.sourceId))).toEqual([
      {
        id: 'seed-paste',
        sourceId: pasted.sourceId,
        locator: '3:9',
        excerpt: 'モックの本文',
        createdAt: 1,
      },
    ])

    const detail = await readSourceDetail(db, pasted.sourceId)
    expect(detail.citations).toEqual([
      {
        id: 'seed-paste',
        excerpt: 'モックの本文',
        bodySpan: null,
      },
    ])
  })

  it('requires citations on detail and ignores them on list items', () => {
    expect(
      sourceListItemSchema.parse({
        id: 'source-1',
        title: 't',
        url: 'https://example.com/a',
        kind: 'url',
        fetchStatus: 'full',
        acquiredVia: 'fetch',
        jobStatus: null,
        jobKind: null,
        createdAt: 1,
        notebook: detailFixture.organization.notebook,
        tags: [],
      }),
    ).toEqual({
      id: 'source-1',
      title: 't',
      url: 'https://example.com/a',
      kind: 'url',
      fetchStatus: 'full',
      acquiredVia: 'fetch',
      jobStatus: null,
      jobKind: null,
      createdAt: 1,
      notebook: {
        id: '11111111-1111-4111-8111-111111111111',
        title: '受信箱',
      },
      tags: [],
    })

    expect(() => sourceDetailSchema.parse(detailFixture)).toThrow()
    expect(sourceDetailSchema.parse({ ...detailFixture, citations: [], qaAnswers: [] }).citations).toEqual([])
    expect(sourceDetailSchema.parse({ ...detailFixture, citations: [], qaAnswers: [] }).qaAnswers).toEqual([])
  })

  it('still gates reads behind Access in production', async () => {
    await expect(
      authenticateAccessRequest(new Request('https://scrapbook.example/'), {
        ENVIRONMENT: 'production',
        ALLOW_INSECURE_AUTH_BYPASS: 'true',
        ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
        ACCESS_AUD: 'test-aud',
        ACCESS_ALLOWED_EMAILS: 'you@example.com',
      }),
    ).rejects.toMatchObject({ code: 'missing_token' })

    const sourcesFn = readFileSync(new URL('../src/server/functions/sources.ts', import.meta.url), 'utf8')
    const getSourceBlock = sourcesFn.slice(
      sourcesFn.indexOf('export const getSource'),
      sourcesFn.indexOf('export const registerSource'),
    )
    expect(getSourceBlock).toContain('export const getSource = createServerFn')
    expect(getSourceBlock).toContain('.middleware([authMiddleware])')
    expect(getSourceBlock).not.toContain('citations')
  })
})
