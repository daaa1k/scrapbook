import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { sources } from '../src/db/schema'
import {
  EMPTY_SOURCE_LIST_FILTER,
  organizationCommandSchema,
  parseSourcesPageSearch,
  sourceListFilterFromSourcesPageSearch,
} from '../src/domain/organization'
import { pasteSourceBody } from '../src/server/ingest/register'
import { applyOrganizationCommand, readOrganizationCatalog } from '../src/server/organization'
import { listSourceViews } from '../src/server/source-views'
import { createTestDb } from './helpers/db'

describe('sources page search', () => {
  const dropped = { notebookId: undefined, sourceId: undefined }

  it('keeps a valid notebookId and drops anything that is not a notebook id', () => {
    const notebookId = '550e8400-e29b-41d4-a716-446655440000'
    expect(parseSourcesPageSearch({ notebookId })).toEqual({ notebookId, sourceId: undefined })
    expect(parseSourcesPageSearch({ notebookId: '受信箱' })).toEqual(dropped)
    expect(parseSourcesPageSearch({ notebookId: '' })).toEqual(dropped)
    expect(parseSourcesPageSearch({})).toEqual(dropped)
    expect(parseSourcesPageSearch(null)).toEqual(dropped)
    expect(sourceListFilterFromSourcesPageSearch({})).toEqual(EMPTY_SOURCE_LIST_FILTER)
    expect(
      sourceListFilterFromSourcesPageSearch(parseSourcesPageSearch({ notebookId })),
    ).toEqual({
      q: '',
      notebookId,
      tagName: null,
    })
  })

  it('keeps sourceId only with a valid notebookId', () => {
    const notebookId = '550e8400-e29b-41d4-a716-446655440000'
    expect(parseSourcesPageSearch({ notebookId, sourceId: 'src-1' })).toEqual({
      notebookId,
      sourceId: 'src-1',
    })
    expect(parseSourcesPageSearch({ notebookId, sourceId: '  src-1  ' })).toEqual({
      notebookId,
      sourceId: 'src-1',
    })
    expect(parseSourcesPageSearch({ notebookId, sourceId: '' })).toEqual({
      notebookId,
      sourceId: undefined,
    })
    expect(parseSourcesPageSearch({ notebookId, sourceId: '   ' })).toEqual({
      notebookId,
      sourceId: undefined,
    })
    expect(parseSourcesPageSearch({ sourceId: 'src-1' })).toEqual(dropped)
    expect(parseSourcesPageSearch({ notebookId: 'not-a-notebook-id', sourceId: 'src-1' })).toEqual(
      dropped,
    )
    const fromUrl = { notebookId: 'not-a-notebook-id', sourceId: 'src-1' }
    expect({ ...fromUrl, ...parseSourcesPageSearch(fromUrl) }).toEqual(dropped)
  })

  it('lists only that notebook when the page search has notebookId', async () => {
    const { db } = createTestDb()
    const apple = await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話' })
    const weather = await pasteSourceBody(db, { title: '無関係', body: '天気の話' })
    const tiedAt = 1_700_000_000_000
    for (const id of [apple.sourceId, weather.sourceId]) {
      await db.update(sources).set({ createdAt: tiedAt }).where(eq(sources.id, id))
    }

    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({ type: 'create-notebook', title: '果物' }),
    )
    const fruitId = (await readOrganizationCatalog(db)).notebooks.find(
      (notebook) => notebook.title === '果物',
    )!.id
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({
        type: 'move-source',
        sourceId: apple.sourceId,
        notebookId: fruitId,
      }),
    )

    const fromUrl = parseSourcesPageSearch({ notebookId: fruitId })
    const filtered = await listSourceViews(db, sourceListFilterFromSourcesPageSearch(fromUrl))
    expect(filtered.map((row) => row.title)).toEqual(['リンゴの記事'])

    const ignored = parseSourcesPageSearch({ notebookId: 'not-a-notebook-id' })
    const unfiltered = await listSourceViews(db, sourceListFilterFromSourcesPageSearch(ignored))
    expect(unfiltered.map((row) => row.title)).toEqual(['無関係', 'リンゴの記事'])
  })
})
