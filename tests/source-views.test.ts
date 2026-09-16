import { describe, expect, it } from 'vitest'
import { likeContainsPattern } from '../src/domain/search'
import { EMPTY_SOURCE_LIST_FILTER, organizationCommandSchema, tagNameSchema } from '../src/domain/organization'
import { pasteSourceBody } from '../src/server/ingest/register'
import { applyOrganizationCommand, readOrganizationCatalog } from '../src/server/organization'
import { listSourceViews } from '../src/server/source-views'
import { createTestDb } from './helpers/db'

describe('source views', () => {
  it('escapes LIKE wildcards in the user query', () => {
    expect(likeContainsPattern('  100% 保証  ')).toBe('%100\\% 保証%')
    expect(likeContainsPattern('a_b')).toBe('%a\\_b%')
    expect(likeContainsPattern('   ')).toBeNull()
  })

  it('returns all sources when q is empty', async () => {
    const { db } = createTestDb()
    await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話' })
    await pasteSourceBody(db, { title: 'ミカン便り', body: 'オレンジ色の果物' })
    await pasteSourceBody(db, { title: '無関係', body: '天気の話' })

    const all = await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    expect(all.map((row) => row.title)).toEqual(['無関係', 'ミカン便り', 'リンゴの記事'])
  })

  it('composes q AND notebook AND tag', async () => {
    const { db } = createTestDb()
    const apple = await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話' })
    const orange = await pasteSourceBody(db, { title: 'ミカン便り', body: 'オレンジ色の果物' })
    const weather = await pasteSourceBody(db, { title: '無関係', body: '天気の話' })

    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'create-notebook', title: '果物' }),
    )
    const fruitId = (await readOrganizationCatalog(db)).notebooks.find((notebook) => notebook.title === '果物')!.id
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({
        type: 'move-source',
        sourceId: apple.sourceId,
        notebookId: fruitId,
      }),
    )
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({
        type: 'move-source',
        sourceId: orange.sourceId,
        notebookId: fruitId,
      }),
    )
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'attach-tag', sourceId: apple.sourceId, tagName: '赤' }),
    )
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'attach-tag', sourceId: orange.sourceId, tagName: '橙' }),
    )
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'attach-tag', sourceId: weather.sourceId, tagName: '赤' }),
    )

    const composed = await listSourceViews(db, {
      q: '果物',
      notebookId: fruitId,
      tagName: tagNameSchema.parse('赤'),
    })
    expect(composed.map((row) => ({ id: row.id, title: row.title }))).toEqual([
      { id: apple.sourceId, title: 'リンゴの記事' },
    ])
    expect(composed[0]?.notebook.title).toBe('果物')
    expect(composed[0]?.tags).toEqual(['赤'])
  })

  it('rejects % as a LIKE wildcard', async () => {
    const { db } = createTestDb()
    await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話' })
    const wildcard = await listSourceViews(db, { q: '%', notebookId: null, tagName: null })
    expect(wildcard).toEqual([])
  })

  it('returns tagged rows when q is empty', async () => {
    const { db } = createTestDb()
    const tagged = await pasteSourceBody(db, { title: 'タグ付き', body: '本文' })
    await pasteSourceBody(db, { title: 'なし', body: '本文' })
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'attach-tag', sourceId: tagged.sourceId, tagName: '後で' }),
    )
    const hits = await listSourceViews(db, {
      q: '',
      notebookId: null,
      tagName: tagNameSchema.parse('後で'),
    })
    expect(hits.map((row) => row.title)).toEqual(['タグ付き'])
  })
})
