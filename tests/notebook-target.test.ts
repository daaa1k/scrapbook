import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { notebooks, sources } from '../src/db/schema'
import { notebookIdSchema, UNTITLED_NOTEBOOK_TITLE } from '../src/domain/organization'
import { parsePdfUpload } from '../src/domain/pdf'
import { registerPdfSource } from '../src/server/ingest/pdf'
import { pasteSourceBody, registerUrlSource } from '../src/server/ingest/register'
import { createTestDb } from './helpers/db'
import { seedNotebook } from './helpers/notebook'
import { createMemoryAssets } from './helpers/r2'

const TINY_PDF = new TextEncoder().encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
const workflow = { create: async () => ({ id: 'wf' }) }
const missingId = notebookIdSchema.parse('00000000-0000-4000-8000-000000000000')

function htmlWithOgTitle(title: string): string {
  return `<!doctype html><html><head><meta property="og:title" content="${title}"><title>ignored</title></head></html>`
}

function mockHtmlFetch(html: string): typeof fetch {
  return async () =>
    new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
}

describe('notebook target', () => {
  it("titles a 'new' URL notebook from og:title when fetch succeeds", async () => {
    const { db } = createTestDb()
    const result = await registerUrlSource(
      db,
      { url: 'https://example.com/a', notebook: 'new' },
      workflow,
      { fetchImpl: mockHtmlFetch(htmlWithOgTitle('記事の題名')) },
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, result.notebookId)))[0]?.title).toBe(
      '記事の題名',
    )
    expect((await db.select().from(sources).where(eq(sources.id, result.sourceId)))[0]?.title).toBe(
      '記事の題名',
    )
  })

  it("titles a 'new' URL notebook after the host when meta fetch fails", async () => {
    const { db } = createTestDb()
    const first = await registerUrlSource(
      db,
      { url: 'https://example.com/a', notebook: 'new' },
      workflow,
      {
        fetchImpl: async () => {
          throw new Error('network')
        },
      },
    )
    const second = await registerUrlSource(
      db,
      { url: 'https://example.com/b', notebook: 'new' },
      workflow,
      {
        fetchImpl: async () => {
          throw new Error('network')
        },
      },
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, first.notebookId)))[0]?.title).toBe(
      'example.com',
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, second.notebookId)))[0]?.title).toBe(
      'example.com (2)',
    )
    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(false)
  })

  it('renames an untitled notebook from the first URL source only', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db, UNTITLED_NOTEBOOK_TITLE)
    const first = await registerUrlSource(
      db,
      { url: 'https://news.example/one', notebook: notebookId },
      workflow,
      { fetchImpl: mockHtmlFetch(htmlWithOgTitle('初回OGP')) },
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, notebookId)))[0]?.title).toBe(
      '初回OGP',
    )
    await registerUrlSource(
      db,
      { url: 'https://news.example/two', notebook: notebookId },
      workflow,
      { fetchImpl: mockHtmlFetch(htmlWithOgTitle('二回目は無視')) },
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, notebookId)))[0]?.title).toBe(
      '初回OGP',
    )
    expect(first.notebookId).toBe(notebookId)
  })

  it('does not overwrite a customized notebook title on first URL source', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db, '手で付けた題')
    await registerUrlSource(
      db,
      { url: 'https://example.com/custom', notebook: notebookId },
      workflow,
      { fetchImpl: mockHtmlFetch(htmlWithOgTitle('OGPは無視')) },
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, notebookId)))[0]?.title).toBe(
      '手で付けた題',
    )
  })

  it('renames an untitled notebook from the first paste and PDF', async () => {
    const { db } = createTestDb()
    const pasteBook = await seedNotebook(db, UNTITLED_NOTEBOOK_TITLE)
    await pasteSourceBody(db, { title: '貼り付け題', body: '本文', notebook: pasteBook })
    expect((await db.select().from(notebooks).where(eq(notebooks.id, pasteBook)))[0]?.title).toBe(
      '貼り付け題',
    )
    await pasteSourceBody(db, { title: '二件目', body: '別本文', notebook: pasteBook })
    expect((await db.select().from(notebooks).where(eq(notebooks.id, pasteBook)))[0]?.title).toBe(
      '貼り付け題',
    )

    const custom = await seedNotebook(db, '研究')
    await pasteSourceBody(db, { title: '貼り付け題', body: '本文', notebook: custom })
    expect((await db.select().from(notebooks).where(eq(notebooks.id, custom)))[0]?.title).toBe('研究')

    const pdfBook = await seedNotebook(db, UNTITLED_NOTEBOOK_TITLE)
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: TINY_PDF, filename: '講義.pdf' })
    await registerPdfSource(db, assets, upload, async () => ({ kind: 'empty' }), pdfBook)
    expect((await db.select().from(notebooks).where(eq(notebooks.id, pdfBook)))[0]?.title).toBe(
      '講義.pdf',
    )
    const secondUpload = parsePdfUpload({ bytes: TINY_PDF, filename: '配布.pdf' })
    await registerPdfSource(db, assets, secondUpload, async () => ({ kind: 'empty' }), pdfBook)
    expect((await db.select().from(notebooks).where(eq(notebooks.id, pdfBook)))[0]?.title).toBe(
      '講義.pdf',
    )
  })

  it("titles a 'new' paste notebook from the paste title cut to 100 characters", async () => {
    const { db } = createTestDb()
    const title = 'あ'.repeat(120)
    const result = await pasteSourceBody(db, {
      title,
      body: '本文です。',
      notebook: 'new',
    })
    const book = (await db.select().from(notebooks).where(eq(notebooks.id, result.notebookId)))[0]
    const source = (await db.select().from(sources).where(eq(sources.id, result.sourceId)))[0]
    expect(book?.title).toBe('あ'.repeat(100))
    expect(source?.notebookId).toBe(result.notebookId)
    expect(source?.title).toBe(title)
  })

  it("titles a 'new' PDF notebook after the filename", async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: TINY_PDF, filename: '講義.pdf' })
    const result = await registerPdfSource(db, assets, upload, async () => ({ kind: 'empty' }), 'new')
    expect((await db.select().from(notebooks).where(eq(notebooks.id, result.notebookId)))[0]?.title).toBe(
      '講義.pdf',
    )
    expect(result.notebookId).toBeTruthy()
  })

  it('rolls back a new notebook when URL insert is aborted', async () => {
    const { db, sqlite } = createTestDb()
    sqlite.exec(`CREATE TRIGGER fail BEFORE INSERT ON sources BEGIN SELECT RAISE(ABORT, 'boom'); END;`)
    await expect(
      registerUrlSource(db, { url: 'https://example.com/fail-new', notebook: 'new' }, workflow, {
        fetchImpl: async () => {
          throw new Error('skip')
        },
      }),
    ).rejects.toThrow()
    expect(await db.select().from(notebooks)).toEqual([])
    expect(await db.select().from(sources)).toEqual([])
  })

  it('rolls back a new notebook when paste insert is aborted', async () => {
    const { db, sqlite } = createTestDb()
    sqlite.exec(`CREATE TRIGGER fail BEFORE INSERT ON sources BEGIN SELECT RAISE(ABORT, 'boom'); END;`)
    await expect(
      pasteSourceBody(db, { title: '失敗', body: '本文', notebook: 'new' }),
    ).rejects.toThrow()
    expect(await db.select().from(notebooks)).toEqual([])
    expect(await db.select().from(sources)).toEqual([])
  })

  it('leaves no notebook, source, or R2 object when PDF put fails on a new notebook', async () => {
    const { db } = createTestDb()
    const assets = {
      put: async () => {
        throw new Error('r2_down')
      },
      get: async () => null,
      delete: async () => {},
    }
    const upload = parsePdfUpload({ bytes: TINY_PDF, filename: 'fail.pdf' })
    await expect(
      registerPdfSource(db, assets, upload, async () => ({ kind: 'empty' }), 'new'),
    ).rejects.toThrow('r2_down')
    expect(await db.select().from(notebooks)).toEqual([])
    expect(await db.select().from(sources)).toEqual([])
  })

  it("does not create a notebook when 'new' hits a URL already registered elsewhere", async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    await registerUrlSource(
      db,
      { url: 'https://example.com/dup', notebook },
      workflow,
      {
        fetchImpl: async () => {
          throw new Error('skip')
        },
      },
    )
    const before = await db.select().from(notebooks)
    await expect(
      registerUrlSource(
        db,
        { url: 'https://example.com/dup', notebook: 'new' },
        workflow,
        {
          fetchImpl: async () => {
            throw new Error('skip')
          },
        },
      ),
    ).rejects.toThrow('source_already_registered')
    expect(await db.select().from(notebooks)).toHaveLength(before.length)
  })

  it('rejects an unknown notebook id without inserting a source', async () => {
    const { db } = createTestDb()
    await expect(
      registerUrlSource(
        db,
        { url: 'https://example.com/missing', notebook: missingId },
        workflow,
        {
          fetchImpl: async () => {
            throw new Error('skip')
          },
        },
      ),
    ).rejects.toThrow('notebook_not_found')
    await expect(
      pasteSourceBody(db, { title: '欠', body: '本文', notebook: missingId }),
    ).rejects.toThrow('notebook_not_found')
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: TINY_PDF, filename: 'missing.pdf' })
    await expect(
      registerPdfSource(db, assets, upload, async () => ({ kind: 'empty' }), missingId),
    ).rejects.toThrow('notebook_not_found')
    expect(await db.select().from(sources)).toEqual([])
    expect(await db.select().from(notebooks)).toEqual([])
  })
})
