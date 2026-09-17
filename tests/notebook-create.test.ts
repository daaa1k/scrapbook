import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { notebooks, sources } from '../src/db/schema'
import { parsePdfUpload } from '../src/domain/pdf'
import { createNotebookWithFirstSource } from '../src/server/notebook-create'
import { createTestDb } from './helpers/db'
import { seedNotebook } from './helpers/notebook'
import { createMemoryAssets } from './helpers/r2'

const TINY_PDF = new TextEncoder().encode('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

describe('createNotebookWithFirstSource', () => {
  it('creates a notebook named after the paste title and stores the source in it', async () => {
    const { db } = createTestDb()
    const result = await createNotebookWithFirstSource(db, {
      kind: 'paste',
      title: '論文A',
      body: '本文です。',
    })
    const book = (await db.select().from(notebooks).where(eq(notebooks.id, result.notebookId)))[0]
    const source = (await db.select().from(sources).where(eq(sources.id, result.sourceId)))[0]
    expect(book?.title).toBe('論文A')
    expect(source?.notebookId).toBe(result.notebookId)
    expect(source?.title).toBe('論文A')
    expect(source?.body).toBe('本文です。')
  })

  it('names a URL notebook after the host and suffixes on collision', async () => {
    const { db } = createTestDb()
    const first = await createNotebookWithFirstSource(
      db,
      { kind: 'url', url: 'https://example.com/a', workflow: { create: async () => ({ id: 'wf' }) } },
    )
    const second = await createNotebookWithFirstSource(
      db,
      { kind: 'url', url: 'https://example.com/b', workflow: { create: async () => ({ id: 'wf' }) } },
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, first.notebookId)))[0]?.title).toBe(
      'example.com',
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, second.notebookId)))[0]?.title).toBe(
      'example.com (2)',
    )
  })

  it('names a PDF notebook after the filename', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: TINY_PDF, filename: '講義.pdf' })
    const result = await createNotebookWithFirstSource(db, {
      kind: 'pdf',
      upload,
      assets,
      extract: async () => ({ kind: 'empty' }),
    })
    expect((await db.select().from(notebooks).where(eq(notebooks.id, result.notebookId)))[0]?.title).toBe(
      '講義.pdf',
    )
  })

  it('rolls back the notebook and leaves no R2 object when PDF put fails', async () => {
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
      createNotebookWithFirstSource(db, {
        kind: 'pdf',
        upload,
        assets,
        extract: async () => ({ kind: 'empty' }),
      }),
    ).rejects.toThrow('r2_down')
    expect(await db.select().from(notebooks)).toEqual([])
    expect(await db.select().from(sources)).toEqual([])
  })

  it('does not create a notebook when the URL is already registered', async () => {
    const { db } = createTestDb()
    await seedNotebook(db)
    await createNotebookWithFirstSource(
      db,
      { kind: 'url', url: 'https://example.com/dup', workflow: { create: async () => ({ id: 'wf' }) } },
    )
    const before = await db.select().from(notebooks)
    await expect(
      createNotebookWithFirstSource(
        db,
        { kind: 'url', url: 'https://example.com/dup', workflow: { create: async () => ({ id: 'wf' }) } },
      ),
    ).rejects.toThrow('source_already_registered')
    expect(await db.select().from(notebooks)).toHaveLength(before.length)
  })
})
