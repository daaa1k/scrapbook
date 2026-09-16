import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { sources } from '../src/db/schema'
import { likeContainsPattern } from '../src/domain/search'
import { EMPTY_SOURCE_LIST_FILTER } from '../src/domain/organization'
import { pasteSourceBody } from '../src/server/ingest/register'
import { listSourceViews } from '../src/server/source-views'
import { createTestDb } from './helpers/db'

describe('source search', () => {
  it('escapes LIKE wildcards in the user query', () => {
    expect(likeContainsPattern('  100% 保証  ')).toBe('%100\\% 保証%')
    expect(likeContainsPattern('a_b')).toBe('%a\\_b%')
    expect(likeContainsPattern('   ')).toBeNull()
  })

  it('returns sources whose title or body contains the query', async () => {
    const { db } = createTestDb()
    const apple = await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話' })
    const orange = await pasteSourceBody(db, { title: 'ミカン便り', body: 'オレンジ色の果物' })
    const other = await pasteSourceBody(db, { title: '無関係', body: '天気の話' })
    const tiedAt = 1_700_000_000_000
    for (const id of [apple.sourceId, orange.sourceId, other.sourceId]) {
      await db.update(sources).set({ createdAt: tiedAt }).where(eq(sources.id, id))
    }

    const byTitle = await listSourceViews(db, { q: 'リンゴ', notebookId: null, tagName: null })
    expect(byTitle.map((row) => row.title)).toEqual(['リンゴの記事'])

    const byBody = await listSourceViews(db, { q: 'オレンジ色', notebookId: null, tagName: null })
    expect(byBody.map((row) => row.title)).toEqual(['ミカン便り'])

    const empty = await listSourceViews(db, EMPTY_SOURCE_LIST_FILTER)
    expect(empty.map((row) => row.title)).toEqual(['無関係', 'ミカン便り', 'リンゴの記事'])

    const none = await listSourceViews(db, { q: 'バナナ', notebookId: null, tagName: null })
    expect(none).toHaveLength(0)

    const wildcard = await listSourceViews(db, { q: '%', notebookId: null, tagName: null })
    expect(wildcard).toHaveLength(0)
  })
})
