import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { sources } from '../src/db/schema'
import { likeContainsPattern } from '../src/domain/search'
import { EMPTY_SOURCE_LIST_FILTER } from '../src/domain/organization'
import { pasteSourceBody } from '../src/server/ingest/register'
import { listSourceViews } from '../src/server/source-views'
import { createTestDb } from './helpers/db'
import { seedNotebook } from './helpers/notebook'

describe('source search', () => {
  it('escapes LIKE wildcards in the user query', () => {
    expect(likeContainsPattern('  100% 保証  ')).toBe('%100\\% 保証%')
    expect(likeContainsPattern('a_b')).toBe('%a\\_b%')
    expect(likeContainsPattern('   ')).toBeNull()
  })

  it('returns sources whose title or body contains the query', async () => {
    const { db } = createTestDb()
    const notebookId = await seedNotebook(db)
    const apple = await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話', notebook: notebookId })
    const orange = await pasteSourceBody(db, { title: 'ミカン便り', body: 'オレンジ色の果物', notebook: notebookId })
    const other = await pasteSourceBody(db, { title: '無関係', body: '天気の話', notebook: notebookId })
    const tiedAt = 1_700_000_000_000
    for (const id of [apple.sourceId, orange.sourceId, other.sourceId]) {
      await db.update(sources).set({ createdAt: tiedAt }).where(eq(sources.id, id))
    }

    const byTitle = await listSourceViews(db, { q: 'リンゴ', notebookId: null, tagName: null })
    expect(byTitle.map((row) => row.title)).toEqual(['リンゴの記事'])

    const byBody = await listSourceViews(db, { q: 'オレンジ色', notebookId: null, tagName: null })
    expect(byBody.map((row) => row.title)).toEqual(['ミカン便り'])

    const empty = await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    expect(empty.map((row) => row.id)).toEqual([apple.sourceId, orange.sourceId, other.sourceId].sort().reverse())

    const none = await listSourceViews(db, { q: 'バナナ', notebookId: null, tagName: null })
    expect(none).toHaveLength(0)

    const wildcard = await listSourceViews(db, { q: '%', notebookId: null, tagName: null })
    expect(wildcard).toHaveLength(0)
  })

  it('returns bounded matching excerpts only for searches, with LIKE-compatible positions', async () => {
    const { db, sqlite } = createTestDb()
    const notebook = await seedNotebook(db)
    const body = `${'前'.repeat(100)}日本語の <script>alert(1)</script> 100%_SAFE ${'後'.repeat(100)}`
    await pasteSourceBody(db, { title: '別の題名', body, notebook })
    await pasteSourceBody(db, { title: 'Mixed TITLE', body: '無関係', notebook })

    const prepare = vi.spyOn(sqlite, 'prepare')
    const normal = await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    expect(normal.every((item) => !('searchMatch' in item))).toBe(true)
    expect(prepare.mock.calls[0]?.[0]).not.toContain('"sources"."body"')
    prepare.mockClear()

    const japanese = await listSourceViews(db, { q: '日本語', notebookId: null, tagName: null })
    expect(japanese).toHaveLength(1)
    expect(japanese[0]?.searchMatch?.field).toBe('body')
    expect(japanese[0]?.searchMatch?.excerpt.length).toBeLessThanOrEqual(160)
    expect(japanese[0]?.searchMatch?.excerpt).not.toBe(body)
    expect(japanese[0]?.searchMatch?.excerpt.slice(japanese[0]?.searchMatch?.start,
      (japanese[0]?.searchMatch?.start ?? 0) + (japanese[0]?.searchMatch?.length ?? 0))).toBe('日本語')
    expect(prepare.mock.calls[0]?.[0]).toContain('substr(')
    expect(prepare.mock.calls[0]?.[0]).not.toMatch(/select[^]*?"sources"\."body"\s+as/i)
    prepare.mockClear()

    const english = await listSourceViews(db, { q: 'mixed', notebookId: null, tagName: null })
    expect(english[0]?.searchMatch).toMatchObject({ field: 'title', excerpt: 'Mixed TITLE', start: 0, length: 5 })
    const percent = await listSourceViews(db, { q: '100%_', notebookId: null, tagName: null })
    expect(percent).toHaveLength(1)
    const percentMatch = percent[0]!.searchMatch!
    expect(Array.from(percentMatch.excerpt).slice(percentMatch.start, percentMatch.start + percentMatch.length).join('')).toBe('100%_')
    const html = await listSourceViews(db, { q: '<script>', notebookId: null, tagName: null })
    expect(html[0]?.searchMatch?.excerpt).toContain('<script>')
    prepare.mockRestore()
  })
})
