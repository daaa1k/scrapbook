import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { jobs, sources } from '../src/db/schema'
import { likeContainsPattern } from '../src/domain/search'
import { EMPTY_SOURCE_LIST_FILTER, organizationCommandSchema, tagNameSchema } from '../src/domain/organization'
import { pasteSourceBody } from '../src/server/ingest/register'
import { applyOrganizationCommand, readOrganizationCatalog } from '../src/server/organization'
import { listSourceViews } from '../src/server/source-views'
import { createTestDb } from './helpers/db'
import { seedNotebook } from './helpers/notebook'

describe('source views', () => {
  it('escapes LIKE wildcards in the user query', () => {
    expect(likeContainsPattern('  100% 保証  ')).toBe('%100\\% 保証%')
    expect(likeContainsPattern('a_b')).toBe('%a\\_b%')
    expect(likeContainsPattern('   ')).toBeNull()
  })

  it('returns all sources when q is empty', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const apple = await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話', notebook: notebookId })
    const orange = await pasteSourceBody(db, { title: 'ミカン便り', body: 'オレンジ色の果物', notebook: notebookId })
    const other = await pasteSourceBody(db, { title: '無関係', body: '天気の話', notebook: notebookId })
    const tiedAt = 1_700_000_000_000
    for (const id of [apple.sourceId, orange.sourceId, other.sourceId]) {
      await db.update(sources).set({ createdAt: tiedAt }).where(eq(sources.id, id))
    }

    const all = await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    expect(all.map((row) => row.title)).toEqual(['無関係', 'ミカン便り', 'リンゴの記事'])
  })

  it('composes q AND notebook AND tag', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const apple = await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話', notebook: notebookId })
    const orange = await pasteSourceBody(db, { title: 'ミカン便り', body: 'オレンジ色の果物', notebook: notebookId })
    const weather = await pasteSourceBody(db, { title: '無関係', body: '天気の話', notebook: notebookId })

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
    const notebookId = await seedNotebook(db)
    await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話', notebook: notebookId })
    const wildcard = await listSourceViews(db, { q: '%', notebookId: null, tagName: null })
    expect(wildcard).toEqual([])
  })

  it('returns tagged rows when q is empty', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const tagged = await pasteSourceBody(db, { title: 'タグ付き', body: '本文', notebook: notebookId })
    await pasteSourceBody(db, { title: 'なし', body: '本文', notebook: notebookId })
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

  it('selects the latest job for each source, breaking timestamp ties by insertion order', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const first = await pasteSourceBody(db, { title: 'first', body: 'body', notebook: notebookId })
    const second = await pasteSourceBody(db, { title: 'second', body: 'body', notebook: notebookId })
    const withoutJob = await pasteSourceBody(db, { title: 'without job', body: 'body', notebook: notebookId })
    for (const [id, sourceId, kind, status, createdAt] of [
      ['first-fetch', first.sourceId, 'fetch', 'failed', 100],
      ['first-summary', first.sourceId, 'summarize_body', 'succeeded', 200],
      ['second-ask', second.sourceId, 'ask_source', 'succeeded', 300],
      ['first-ask', first.sourceId, 'ask_source', 'queued', 200],
      ['second-fetch', second.sourceId, 'fetch', 'failed', 100],
    ] as const) {
      await db.insert(jobs).values({ id, sourceId, kind, status, createdAt, updatedAt: createdAt })
    }

    const rows = await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    const byId = new Map(rows.map((row) => [row.id, row]))
    expect([byId.get(first.sourceId)?.jobStatus, byId.get(first.sourceId)?.jobKind]).toEqual([
      'queued',
      'ask_source',
    ])
    expect([byId.get(second.sourceId)?.jobStatus, byId.get(second.sourceId)?.jobKind]).toEqual([
      'succeeded',
      'ask_source',
    ])
    expect([byId.get(withoutJob.sourceId)?.jobStatus, byId.get(withoutJob.sourceId)?.jobKind]).toEqual([
      null,
      null,
    ])
    expect(Object.keys(rows[0]!)).toEqual([
      'id', 'title', 'url', 'kind', 'fetchStatus', 'acquiredVia', 'jobStatus', 'jobKind',
      'createdAt', 'updatedAt', 'notebook', 'tags',
    ])
  })

  it('uses a fixed number of SQL statements for one or many sources', async () => {
    const { db, sqlite } = createTestDb()
    const notebookId = await seedNotebook(db)
    await pasteSourceBody(db, { title: 'first', body: 'body', notebook: notebookId })
    const prepare = vi.spyOn(sqlite, 'prepare')

    await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    const oneSourceQueries = prepare.mock.calls.map(([statement]) => statement)
    prepare.mockClear()

    await pasteSourceBody(db, { title: 'second', body: 'body', notebook: notebookId })
    await pasteSourceBody(db, { title: 'third', body: 'body', notebook: notebookId })
    prepare.mockClear()
    await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    const threeSourceQueries = prepare.mock.calls.map(([statement]) => statement)
    prepare.mockRestore()

    expect(oneSourceQueries).toHaveLength(3)
    expect(threeSourceQueries).toHaveLength(3)
    expect(oneSourceQueries.filter((statement) => statement.includes('"jobs"'))).toHaveLength(1)
    expect(threeSourceQueries.filter((statement) => statement.includes('"jobs"'))).toHaveLength(1)
  })
})
