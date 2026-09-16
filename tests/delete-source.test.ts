import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  citations,
  cursorRuns,
  jobs,
  notebooks,
  qaAnswers,
  qaCitations,
  sourceTags,
  sources,
} from '../src/db/schema'
import { isTerminalJobStatus } from '../src/domain/jobs'
import { EMPTY_SOURCE_LIST_FILTER, organizationCommandSchema } from '../src/domain/organization'
import { MOCK_ASK_JSON, MOCK_INGEST_JSON, createMockCursorClient } from '../src/server/cursor/client'
import {
  askSourceQuestion,
  deleteSource,
  pasteSourceBody,
  registerUrlSource,
} from '../src/server/ingest/register'
import { pdfOriginalKey, registerPdfSource } from '../src/server/ingest/pdf'
import { applyOrganizationCommand } from '../src/server/organization'
import { createImmediateStep, runIngestWorkflow } from '../src/server/ingest/workflow-run'
import { listSourceViews } from '../src/server/source-views'
import { createTestDb } from './helpers/db'
import { createMemoryAssets } from './helpers/r2'

const TINY_PDF = new TextEncoder().encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

describe('delete source', () => {
  it('removes a terminal source with Q&A, citations, tags, jobs, and R2 object', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const pdf = await registerPdfSource(
      db,
      assets,
      { bytes: TINY_PDF as never, title: '消すPDF' },
      async () => ({ kind: 'empty' }),
    )
    const key = pdfOriginalKey(pdf.sourceId)
    expect(await assets.get(key)).not.toBeNull()

    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'attach-tag', sourceId: pdf.sourceId, tagName: '一時' }),
    )
    await db.update(sources).set({ body: 'これはモックの本文です。' }).where(eq(sources.id, pdf.sourceId))

    const created: unknown[] = []
    const asked = await askSourceQuestion(db, pdf.sourceId, '要点は？', {
      create: async (options) => {
        created.push(options.params)
        return { id: 'wf-ask' }
      },
    })
    const qaAnswerId = (created[0] as { qaAnswerId: string }).qaAnswerId
    await runIngestWorkflow({
      params: {
        mode: 'ask_source',
        jobId: asked.jobId,
        sourceId: pdf.sourceId,
        qaAnswerId,
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({ result: JSON.stringify(MOCK_ASK_JSON) }),
      maxPolls: 2,
      pollSleep: 0,
    })

    await db.insert(citations).values({
      id: 'cite-1',
      sourceId: pdf.sourceId,
      locator: '-',
      excerpt: '残るはずがない',
      createdAt: Date.now(),
    })

    await deleteSource(db, pdf.sourceId, assets)

    expect(await db.select().from(sources).where(eq(sources.id, pdf.sourceId))).toHaveLength(0)
    expect(await db.select().from(jobs).where(eq(jobs.sourceId, pdf.sourceId))).toHaveLength(0)
    expect(await db.select().from(qaAnswers)).toHaveLength(0)
    expect(await db.select().from(qaCitations)).toHaveLength(0)
    expect(await db.select().from(citations)).toHaveLength(0)
    expect(await db.select().from(cursorRuns)).toHaveLength(0)
    expect(await db.select().from(sourceTags).where(eq(sourceTags.sourceId, pdf.sourceId))).toHaveLength(0)
    expect(await assets.get(key)).toBeNull()
  })

  it('rejects delete while a job is in flight', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/busy-del' }, {
      create: async () => ({ id: 'wf' }),
    })
    await expect(deleteSource(db, registered.sourceId, undefined)).rejects.toThrow('source_in_progress')
  })

  it('allows notebook delete after its last source is removed', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, { title: '単独', body: '本文' })
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'create-notebook', title: '空にする箱' }),
    )
    const notebookId = (await db.select().from(notebooks).where(eq(notebooks.title, '空にする箱')))[0]!.id
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({
        type: 'move-source',
        sourceId: pasted.sourceId,
        notebookId,
      }),
    )
    await expect(
      applyOrganizationCommand(
        db,
        organizationCommandSchema.parse({ type: 'delete-notebook', notebookId }),
      ),
    ).rejects.toThrow('notebook_not_empty')

    await deleteSource(db, pasted.sourceId, undefined)
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'delete-notebook', notebookId }),
    )
    expect(await db.select().from(notebooks).where(eq(notebooks.id, notebookId))).toHaveLength(0)
  })

  it('still removes D1 when the R2 object is already gone', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const registered = await registerUrlSource(db, { url: 'https://example.com/ok-del' }, {
      create: async () => ({ id: 'wf' }),
    })
    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: registered.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/ok-del',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({
        result: JSON.stringify({ ...MOCK_INGEST_JSON, body: '短い本文' }),
      }),
      maxPolls: 2,
      pollSleep: 0,
    })
    await db.update(sources).set({ r2Key: 'pdf/missing/original.pdf' }).where(eq(sources.id, registered.sourceId))
    await deleteSource(db, registered.sourceId, assets)
    expect(await db.select().from(sources).where(eq(sources.id, registered.sourceId))).toHaveLength(0)
  })

  it('list eligibility matches the idle gate used by deleteSource', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/list-del' }, {
      create: async () => ({ id: 'wf' }),
    })
    const busy = await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    const busyItem = busy.find((item) => item.id === registered.sourceId)
    expect(busyItem?.jobStatus).toBe('queued')
    expect(busyItem?.jobStatus === null || isTerminalJobStatus(busyItem!.jobStatus)).toBe(false)

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

    const idle = await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    const idleItem = idle.find((item) => item.id === registered.sourceId)
    expect(idleItem?.jobStatus === null || isTerminalJobStatus(idleItem!.jobStatus)).toBe(true)
    await deleteSource(db, registered.sourceId, undefined)
    expect(await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)).toHaveLength(0)
  })
})
