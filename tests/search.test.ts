import { describe, expect, it } from 'vitest'
import { likeContainsPattern } from '../src/domain/search'
import { pasteSourceBody } from '../src/server/ingest/register'
import { findSourcesByQuery } from '../src/server/ingest/search'
import { createTestDb } from './helpers/db'

describe('source search', () => {
  it('escapes LIKE wildcards in the user query', () => {
    expect(likeContainsPattern('  100% 保証  ')).toBe('%100\\% 保証%')
    expect(likeContainsPattern('a_b')).toBe('%a\\_b%')
    expect(likeContainsPattern('   ')).toBeNull()
  })

  it('returns sources whose title or body contains the query', async () => {
    const { db } = createTestDb()
    await pasteSourceBody(db, { title: 'リンゴの記事', body: '赤い果物の話' })
    await pasteSourceBody(db, { title: 'ミカン便り', body: 'オレンジ色の果物' })
    await pasteSourceBody(db, { title: '無関係', body: '天気の話' })

    const byTitle = await findSourcesByQuery(db, 'リンゴ')
    expect(byTitle.map((row) => row.title)).toEqual(['リンゴの記事'])

    const byBody = await findSourcesByQuery(db, 'オレンジ色')
    expect(byBody.map((row) => row.title)).toEqual(['ミカン便り'])

    const empty = await findSourcesByQuery(db, '   ')
    expect(empty).toHaveLength(3)

    const none = await findSourcesByQuery(db, 'バナナ')
    expect(none).toHaveLength(0)

    const wildcard = await findSourcesByQuery(db, '%')
    expect(wildcard).toHaveLength(0)
  })
})
