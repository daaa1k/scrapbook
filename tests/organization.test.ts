import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { notebooks, sources, sourceTags } from '../src/db/schema'
import {
  INBOX_NOTEBOOK_TITLE,
  notebookIdSchema,
  organizationCommandSchema,
  organizationMutationAckSchema,
  type OrganizationCommand,
} from '../src/domain/organization'
import { pasteSourceBody } from '../src/server/ingest/register'
import {
  applyOrganizationCommand,
  ensureInboxNotebook,
  readOrganizationCatalog,
} from '../src/server/organization'
import { createTestDb } from './helpers/db'

async function run(db: ReturnType<typeof createTestDb>['db'], input: unknown) {
  return applyOrganizationCommand(db, organizationCommandSchema.parse(input) as OrganizationCommand)
}

describe('organization', () => {
  it('ensureInbox twice returns the same id and one row', async () => {
    const { db } = createTestDb()
    const first = await ensureInboxNotebook(db)
    const second = await ensureInboxNotebook(db)
    expect(second).toBe(first)
    const rows = await db.select().from(notebooks)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(first)
    expect(rows[0]?.title).toBe(INBOX_NOTEBOOK_TITLE)
  })

  it('creates and renames unique titles and protects 受信箱', async () => {
    const { db } = createTestDb()
    const inboxId = await ensureInboxNotebook(db)

    const firstCreate = await run(db, { type: 'create-notebook', title: '研究' })
    const secondCreate = await run(db, { type: 'create-notebook', title: '研究' })
    const created = await db.select().from(notebooks).where(eq(notebooks.title, '研究'))
    expect(created).toHaveLength(1)
    const researchId = created[0]!.id
    expect(firstCreate).toEqual({ ok: true, notebookId: researchId })
    expect(secondCreate).toEqual({ ok: true, notebookId: researchId })

    await expect(run(db, { type: 'create-notebook', title: '受信箱' })).rejects.toThrow(
      'notebook_title_reserved',
    )
    await expect(
      run(db, { type: 'rename-notebook', notebookId: researchId, title: '受信箱' }),
    ).rejects.toThrow('notebook_title_reserved')
    await expect(
      run(db, { type: 'rename-notebook', notebookId: inboxId, title: '受信箱' }),
    ).rejects.toThrow('inbox_notebook_immutable')
    await expect(
      run(db, { type: 'rename-notebook', notebookId: inboxId, title: '別の名前' }),
    ).rejects.toThrow('inbox_notebook_immutable')
    await expect(run(db, { type: 'delete-notebook', notebookId: inboxId })).rejects.toThrow(
      'inbox_notebook_immutable',
    )

    await run(db, { type: 'rename-notebook', notebookId: researchId, title: '論文' })
    expect(
      await run(db, { type: 'rename-notebook', notebookId: created[0]!.id, title: '論文' }),
    ).toEqual({ ok: true })
    expect((await db.select().from(notebooks).where(eq(notebooks.id, researchId)))[0]?.title).toBe(
      '論文',
    )

    await run(db, { type: 'create-notebook', title: '重複先' })
    await expect(
      run(db, { type: 'rename-notebook', notebookId: researchId, title: '重複先' }),
    ).rejects.toThrow('notebook_title_taken')
  })

  it('deletes an empty notebook and rejects a notebook that still has sources', async () => {
    const { db } = createTestDb()
    await run(db, { type: 'create-notebook', title: '空' })
    const emptyId = (await db.select().from(notebooks).where(eq(notebooks.title, '空')))[0]!.id
    await run(db, { type: 'delete-notebook', notebookId: emptyId })
    expect(await db.select().from(notebooks).where(eq(notebooks.id, emptyId))).toEqual([])

    await run(db, { type: 'delete-notebook', notebookId: emptyId })

    await run(db, { type: 'create-notebook', title: '中身あり' })
    const fullId = (await db.select().from(notebooks).where(eq(notebooks.title, '中身あり')))[0]!.id
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文' })
    await run(db, { type: 'move-source', sourceId: pasted.sourceId, notebookId: fullId })
    await expect(run(db, { type: 'delete-notebook', notebookId: fullId })).rejects.toThrow(
      'notebook_not_empty',
    )
    expect((await db.select().from(notebooks).where(eq(notebooks.id, fullId)))[0]?.title).toBe(
      '中身あり',
    )
  })

  it('moves a pasted inbox source into the notebookId returned by create', async () => {
    const { db } = createTestDb()
    const created = organizationMutationAckSchema.parse(
      await run(db, { type: 'create-notebook', title: '研究' }),
    )
    const notebookId = notebookIdSchema.parse(created.notebookId)
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文' })
    const inboxId = await ensureInboxNotebook(db)
    expect((await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]?.notebookId).toBe(
      inboxId,
    )

    await run(db, { type: 'move-source', sourceId: pasted.sourceId, notebookId })
    expect((await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]?.notebookId).toBe(
      notebookId,
    )
  })

  it('moves a source by changing only notebook_id', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文' })
    await run(db, { type: 'set-memo', sourceId: pasted.sourceId, memo: 'メモ' })
    await run(db, { type: 'attach-tag', sourceId: pasted.sourceId, tagName: 'AI' })
    const before = (await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]!
    await run(db, { type: 'create-notebook', title: '研究' })
    const researchId = (await db.select().from(notebooks).where(eq(notebooks.title, '研究')))[0]!.id

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
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文' })
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
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文' })
    await run(db, { type: 'set-memo', sourceId: pasted.sourceId, memo: '   ' })
    expect((await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]?.memo).toBeNull()

    await run(db, { type: 'set-memo', sourceId: pasted.sourceId, memo: '  残す  ' })
    expect((await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]?.memo).toBe(
      '  残す  ',
    )
  })

  it('reports catalog counts after move and attach', async () => {
    const { db } = createTestDb()
    const pasted = await pasteSourceBody(db, { title: '記事', body: '本文' })
    await run(db, { type: 'create-notebook', title: '研究' })
    const researchId = (await db.select().from(notebooks).where(eq(notebooks.title, '研究')))[0]!.id
    await run(db, { type: 'move-source', sourceId: pasted.sourceId, notebookId: researchId })
    await run(db, { type: 'attach-tag', sourceId: pasted.sourceId, tagName: '論文' })

    const catalog = await readOrganizationCatalog(db)
    expect(catalog.notebooks.map((notebook) => notebook.title)).toEqual(['受信箱', '研究'])
    expect(catalog.notebooks[0]?.isInbox).toBe(true)
    expect(catalog.notebooks[0]?.sourceCount).toBe(0)
    expect(catalog.notebooks[1]?.sourceCount).toBe(1)
    expect(catalog.tags).toEqual(['論文'])
  })
})
