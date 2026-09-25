import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
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
import { notebookIdSchema, organizationCommandSchema } from '../src/domain/organization'
import { MOCK_ASK_JSON, createMockCursorClient } from '../src/server/cursor/client'
import { pdfOriginalKey, registerPdfSource } from '../src/server/ingest/pdf'
import {
  askSourceQuestion,
  deleteNotebookWithSources,
  deleteSource,
  pasteSourceBody,
  registerUrlSource,
} from '../src/server/ingest/register'
import { applyOrganizationCommand } from '../src/server/organization'
import { createImmediateStep, runIngestWorkflow } from '../src/server/ingest/workflow-run'
import { createTestDb } from './helpers/db'
import { deleteGraphSnapshot, seedDeleteGraph } from './helpers/delete'
import { seedNotebook } from './helpers/notebook'
import { createMemoryAssets } from './helpers/r2'

const TINY_PDF = new TextEncoder().encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
const missingId = notebookIdSchema.parse('00000000-0000-4000-8000-000000000000')

describe('delete notebook with sources', () => {
  it('rolls back all sources when deleting the second source fails', async () => {
    const { db, sqlite } = createTestDb()
    const first = await seedDeleteGraph(db)
    const second = await seedDeleteGraph(db, first.notebookId)
    const assets = createMemoryAssets()
    const firstKey = pdfOriginalKey(first.sourceId)
    const secondKey = pdfOriginalKey(second.sourceId)
    for (const [sourceId, key] of [[first.sourceId, firstKey], [second.sourceId, secondKey]] as const) {
      await assets.put(key, new Uint8Array([1]) as never)
      await db.update(sources).set({ r2Key: key }).where(eq(sources.id, sourceId))
    }
    const before = await deleteGraphSnapshot(db)
    sqlite.exec(`CREATE TRIGGER reject_second_source BEFORE DELETE ON sources
      WHEN OLD.id = '${second.sourceId}'
      BEGIN SELECT RAISE(ABORT, 'second_source_failed'); END;`)

    await expect(deleteNotebookWithSources(db, first.notebookId, assets)).rejects.toThrow('second_source_failed')
    expect(await deleteGraphSnapshot(db)).toEqual(before)
    expect(await assets.get(firstKey)).toEqual(new Uint8Array([1]))
    expect(await assets.get(secondKey)).toEqual(new Uint8Array([1]))
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
  })

  it('keeps every source when a job is enqueued after the idle check', async () => {
    const { db, sqlite } = createTestDb()
    const first = await seedDeleteGraph(db)
    await seedDeleteGraph(db, first.notebookId)
    const before = await deleteGraphSnapshot(db)
    const transaction = db.transaction.bind(db)
    // Insert at the DB boundary, after the application has read the notebook.
    let inserted = false
    vi.spyOn(db, 'transaction').mockImplementation(((callback) => {
      if (!inserted) {
        inserted = true
        sqlite.prepare(`INSERT INTO jobs (id, source_id, kind, status, created_at, updated_at)
          VALUES (?, ?, 'fetch', 'queued', 2, 2)`).run('new-job', first.sourceId)
      }
      return transaction(callback)
    }) as typeof db.transaction)

    await expect(deleteNotebookWithSources(db, first.notebookId, undefined)).rejects.toThrow('notebook_in_progress')
    const after = await deleteGraphSnapshot(db)
    expect(after).toEqual({ ...before, jobs: [...before.jobs, expect.objectContaining({ id: 'new-job', status: 'queued' })] })
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
  })

  it('removes every source child, R2 object, and the notebook row', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const notebookId = await seedNotebook(db, '消す箱')
    const pdf = await registerPdfSource(
      db,
      assets,
      { bytes: TINY_PDF as never, title: '消すPDF' },
      async () => ({ kind: 'empty' }),
      notebookId,
    )
    const key = pdfOriginalKey(pdf.sourceId)
    expect(await assets.get(key)).not.toBeNull()

    const pasted = await pasteSourceBody(db, {
      title: '記事',
      body: 'これはモックの本文です。',
      notebook: notebookId,
    })
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'attach-tag', sourceId: pasted.sourceId, tagName: '一時' }),
    )
    await db.insert(citations).values({
      id: 'cite-1',
      sourceId: pasted.sourceId,
      locator: '-',
      excerpt: '残るはずがない',
      createdAt: Date.now(),
    })

    const created: unknown[] = []
    const asked = await askSourceQuestion(db, pasted.sourceId, '要点は？', {
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
        sourceId: pasted.sourceId,
        qaAnswerId,
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({ result: JSON.stringify(MOCK_ASK_JSON) }),
      maxPolls: 2,
      pollSleep: 0,
    })

    const result = await deleteNotebookWithSources(db, notebookId, assets)
    expect(result).toEqual({ deleted: true })
    expect(await db.select().from(notebooks).where(eq(notebooks.id, notebookId))).toEqual([])
    expect(await db.select().from(sources)).toEqual([])
    expect(await db.select().from(jobs)).toEqual([])
    expect(await db.select().from(qaAnswers)).toEqual([])
    expect(await db.select().from(qaCitations)).toEqual([])
    expect(await db.select().from(citations)).toEqual([])
    expect(await db.select().from(cursorRuns)).toEqual([])
    expect(await db.select().from(sourceTags)).toEqual([])
    expect(await assets.get(key)).toBeNull()
  })

  it('rejects delete when a source job is in progress and leaves every row', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db, '処理中')
    await registerUrlSource(
      db,
      { url: 'https://example.com/busy-notebook', notebook: notebookId },
      { create: async () => ({ id: 'wf' }) },
    )
    await expect(deleteNotebookWithSources(db, notebookId, undefined)).rejects.toThrow(
      'notebook_in_progress',
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, notebookId)))[0]?.title).toBe(
      '処理中',
    )
    expect(await db.select().from(sources)).toHaveLength(1)
    expect(await db.select().from(jobs)).toHaveLength(1)
  })

  it('treats a missing notebook as already deleted', async () => {
    const { db } = createTestDb()
    expect(await deleteNotebookWithSources(db, missingId, undefined)).toEqual({ deleted: true })
  })

  it('keeps the notebook after its last source is removed', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db, '空にする箱')
    const pasted = await pasteSourceBody(db, { title: '単独', body: '本文', notebook: notebookId })
    await deleteSource(db, pasted.sourceId, undefined)
    expect(await db.select().from(sources)).toEqual([])
    expect((await db.select().from(notebooks).where(eq(notebooks.id, notebookId)))[0]?.title).toBe(
      '空にする箱',
    )
    await deleteNotebookWithSources(db, notebookId, undefined)
    expect(await db.select().from(notebooks).where(eq(notebooks.id, notebookId))).toEqual([])
  })
})
