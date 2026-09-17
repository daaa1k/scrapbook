import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { notebooks, sources, sourceTags } from '../src/db/schema'
import {
  notebookIdSchema,
  notebookTitleHint,
  organizationCommandSchema,
  organizationMutationAckSchema,
  uniqueNotebookTitle,
  type OrganizationCommand,
} from '../src/domain/organization'
import { pasteSourceBody, registerUrlSource } from '../src/server/ingest/register'
import { applyOrganizationCommand, readOrganizationCatalog } from '../src/server/organization'
import { createTestDb } from './helpers/db'
import { seedNotebook } from './helpers/notebook'

async function run(db: ReturnType<typeof createTestDb>['db'], input: unknown) {
  return applyOrganizationCommand(db, organizationCommandSchema.parse(input) as OrganizationCommand)
}

function migrateInboxSql(): string {
  return readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../drizzle/0005_migrate_inbox.sql'),
    'utf8',
  ).replace(/--> statement-breakpoint/g, '')
}

describe('notebook titles', () => {
  it('prefers source title, then pdf filename, then url host, then 無題のノート', () => {
    expect(notebookTitleHint({ sourceTitle: '論文A', pdfFilename: 'x.pdf', url: 'https://example.com' })).toBe(
      '論文A',
    )
    expect(notebookTitleHint({ pdfFilename: '講義.pdf', url: 'https://example.com' })).toBe('講義.pdf')
    expect(notebookTitleHint({ url: 'https://www.example.com/a' })).toBe('example.com')
    expect(notebookTitleHint({})).toBe('無題のノート')
  })

  it('adds a numeric suffix when the preferred title is taken', () => {
    expect(uniqueNotebookTitle('研究', [])).toBe('研究')
    expect(uniqueNotebookTitle('研究', ['研究'])).toBe('研究 (2)')
    expect(uniqueNotebookTitle('研究', ['研究', '研究 (2)'])).toBe('研究 (3)')
    expect(uniqueNotebookTitle('  ', ['無題のノート'])).toBe('無題のノート (2)')
  })
})

describe('organization', () => {
  it('does not create a notebook on an empty catalog', async () => {
    const { db } = createTestDb()
    const catalog = await readOrganizationCatalog(db)
    expect(catalog).toEqual({ notebooks: [], tags: [] })
  })

  it('creates and renames unique titles, including 受信箱 as an ordinary name', async () => {
    const { db } = createTestDb()

    const firstCreate = await run(db, { type: 'create-notebook', title: '研究' })
    const secondCreate = await run(db, { type: 'create-notebook', title: '研究' })
    const created = await db.select().from(notebooks).where(eq(notebooks.title, '研究'))
    expect(created).toHaveLength(1)
    const researchId = created[0]!.id
    expect(firstCreate).toEqual({ ok: true, notebookId: researchId })
    expect(secondCreate).toEqual({ ok: true, notebookId: researchId })

    const inboxCreate = await run(db, { type: 'create-notebook', title: '受信箱' })
    const inboxId = notebookIdSchema.parse(inboxCreate.notebookId)
    expect((await db.select().from(notebooks).where(eq(notebooks.id, inboxId)))[0]?.title).toBe('受信箱')

    await run(db, { type: 'rename-notebook', notebookId: inboxId, title: '普通のノート' })
    expect((await db.select().from(notebooks).where(eq(notebooks.id, inboxId)))[0]?.title).toBe('普通のノート')

    await run(db, { type: 'rename-notebook', notebookId: researchId, title: '論文' })
    expect(
      await run(db, { type: 'rename-notebook', notebookId: created[0]!.id, title: '論文' }),
    ).toEqual({ ok: true })
    expect((await db.select().from(notebooks).where(eq(notebooks.id, researchId)))[0]?.title).toBe('論文')

    await run(db, { type: 'create-notebook', title: '重複先' })
    await expect(
      run(db, { type: 'rename-notebook', notebookId: researchId, title: '重複先' }),
    ).rejects.toThrow('notebook_title_taken')
  })

  it('deletes an empty notebook and cascade-deletes sources in a notebook', async () => {
    const { db } = createTestDb()
    await run(db, { type: 'create-notebook', title: '空' })
    const emptyId = (await db.select().from(notebooks).where(eq(notebooks.title, '空')))[0]!.id
    await run(db, { type: 'delete-notebook', notebookId: emptyId })
    expect(await db.select().from(notebooks).where(eq(notebooks.id, emptyId))).toEqual([])

    await run(db, { type: 'delete-notebook', notebookId: emptyId })

    const fullId = await seedNotebook(db, '中身あり')
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文', notebookId: fullId })
    await run(db, { type: 'delete-notebook', notebookId: fullId })
    expect(await db.select().from(notebooks).where(eq(notebooks.id, fullId))).toEqual([])
    expect(await db.select().from(sources).where(eq(sources.id, pasted.sourceId))).toEqual([])
  })

  it('rejects notebook delete when a source job is in progress', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db, '処理中')
    await registerUrlSource(
      db,
      { url: 'https://example.com/busy-notebook', notebookId },
      { create: async () => ({ id: 'wf' }) },
    )
    await expect(run(db, { type: 'delete-notebook', notebookId })).rejects.toThrow('notebook_in_progress')
    expect((await db.select().from(notebooks).where(eq(notebooks.id, notebookId)))[0]?.title).toBe('処理中')
    expect(await db.select().from(sources)).toHaveLength(1)
  })

  it('creates a source directly in the given notebook without an inbox', async () => {
    const { db } = createTestDb()
    const created = organizationMutationAckSchema.parse(
      await run(db, { type: 'create-notebook', title: '研究' }),
    )
    const notebookId = notebookIdSchema.parse(created.notebookId)
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文', notebookId })
    expect((await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]?.notebookId).toBe(
      notebookId,
    )
    expect(await db.select().from(notebooks)).toHaveLength(1)
  })

  it('moves a source by changing only notebook_id', async () => {
    const { db } = createTestDb()
    const originId = await seedNotebook(db, '元')
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文', notebookId: originId })
    await run(db, { type: 'set-memo', sourceId: pasted.sourceId, memo: 'メモ' })
    await run(db, { type: 'attach-tag', sourceId: pasted.sourceId, tagName: 'AI' })
    const before = (await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]!
    const researchId = await seedNotebook(db, '研究')

    await run(db, { type: 'move-source', sourceId: pasted.sourceId, notebookId: researchId })
    const after = (await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]!
    expect(after.notebookId).toBe(researchId)
    expect(after.notebookId).not.toBe(before.notebookId)
    expect({
      ...after,
      notebookId: before.notebookId,
      updatedAt: before.updatedAt,
    }).toEqual(before)
  })

  it('attaches a tag once and treats a missing detach as success', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文', notebookId })
    await run(db, { type: 'attach-tag', sourceId: pasted.sourceId, tagName: 'AI' })
    await run(db, { type: 'attach-tag', sourceId: pasted.sourceId, tagName: 'AI' })
    await run(db, { type: 'attach-tag', sourceId: pasted.sourceId, tagName: 'ai' })
    const attached = await db.select().from(sourceTags).where(eq(sourceTags.sourceId, pasted.sourceId))
    expect(attached.map((row) => row.tagName).sort()).toEqual(['AI', 'ai'])

    await run(db, { type: 'detach-tag', sourceId: pasted.sourceId, tagName: 'ない' })
    await run(db, { type: 'detach-tag', sourceId: pasted.sourceId, tagName: 'AI' })
    const left = await db.select().from(sourceTags).where(eq(sourceTags.sourceId, pasted.sourceId))
    expect(left.map((row) => row.tagName)).toEqual(['ai'])
  })

  it('stores a whitespace-only memo as null and round-trips other whitespace', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文', notebookId })
    await run(db, { type: 'set-memo', sourceId: pasted.sourceId, memo: '   ' })
    expect((await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]?.memo).toBeNull()

    await run(db, { type: 'set-memo', sourceId: pasted.sourceId, memo: '  残す  ' })
    expect((await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]?.memo).toBe(
      '  残す  ',
    )
  })

  it('reports catalog counts and sorts by updatedAt then createdAt', async () => {
    const { db } = createTestDb()
    const olderId = await seedNotebook(db, '古い')
    const newerId = await seedNotebook(db, '新しい')
    await db.update(notebooks).set({ createdAt: 10, updatedAt: 10 }).where(eq(notebooks.id, olderId))
    await db.update(notebooks).set({ createdAt: 20, updatedAt: 20 }).where(eq(notebooks.id, newerId))

    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文', notebookId: olderId })
    await run(db, { type: 'attach-tag', sourceId: pasted.sourceId, tagName: '論文' })

    const catalog = await readOrganizationCatalog(db)
    expect(catalog.notebooks.map((notebook) => notebook.title)).toEqual(['古い', '新しい'])
    expect(catalog.notebooks[0]?.sourceCount).toBe(1)
    expect(catalog.notebooks[1]?.sourceCount).toBe(0)
    expect(catalog.notebooks[0]?.updatedAt).toBeGreaterThan(catalog.notebooks[1]!.updatedAt)
    expect(catalog.tags).toEqual(['論文'])
  })
})

describe('inbox migration', () => {
  it('deletes an empty 受信箱 notebook', async () => {
    const { db, sqlite } = createTestDb()
    sqlite
      .prepare('INSERT INTO notebooks (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('11111111-1111-4111-8111-111111111111', '受信箱', 1, 1)
    sqlite.exec(migrateInboxSql())
    expect(await db.select().from(notebooks)).toEqual([])
  })

  it('renames a 受信箱 that has sources, using a numeric suffix on collision', async () => {
    const { db, sqlite } = createTestDb()
    sqlite
      .prepare('INSERT INTO notebooks (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('11111111-1111-4111-8111-111111111111', '移行済みノート', 1, 1)
    sqlite
      .prepare('INSERT INTO notebooks (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('22222222-2222-4222-8222-222222222222', '受信箱', 2, 2)
    sqlite
      .prepare(
        'INSERT INTO sources (id, notebook_id, kind, fetch_status, acquired_via, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'url', 'none', 'fetch', 3, 3)

    sqlite.exec(migrateInboxSql())

    const rows = await db.select().from(notebooks)
    const titles = rows.map((row) => row.title).sort()
    expect(titles).toEqual(['移行済みノート', '移行済みノート (2)'])
    const migrated = rows.find((row) => row.id === '22222222-2222-4222-8222-222222222222')
    expect(migrated?.title).toBe('移行済みノート (2)')
    expect((await db.select().from(sources))[0]?.notebookId).toBe('22222222-2222-4222-8222-222222222222')
  })
})
