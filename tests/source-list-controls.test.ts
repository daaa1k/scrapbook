import { describe, expect, it } from 'vitest'
import {
  QUESTION_EXAMPLES,
  SOURCE_LIST_SORT_DEFAULT,
  sortSourceListItems,
  sourceListSearchEmptyCopy,
} from '../src/domain/source-list-controls'
import { notebookIdSchema, notebookTitleSchema } from '../src/domain/organization'
import { sourceListItemSchema } from '../src/domain/source-views'

const notebook = {
  id: notebookIdSchema.parse('550e8400-e29b-41d4-a716-446655440000'),
  title: notebookTitleSchema.parse('研究'),
}

function item(id: string, title: string, createdAt: number, updatedAt: number) {
  return sourceListItemSchema.parse({
    id,
    title,
    url: null,
    kind: 'url',
    fetchStatus: 'full',
    acquiredVia: 'paste',
    jobStatus: null,
    jobKind: null,
    createdAt,
    updatedAt,
    notebook,
    tags: [],
  })
}

describe('sortSourceListItems', () => {
  const items = [item('a', 'ベータ', 10, 30), item('b', 'アルファ', 20, 10), item('c', 'ガンマ', 5, 40)]

  it('defaults to created desc', () => {
    expect(SOURCE_LIST_SORT_DEFAULT).toBe('created')
    expect(sortSourceListItems(items, 'created').map((row) => row.id)).toEqual(['b', 'a', 'c'])
  })

  it('sorts by updated and title', () => {
    expect(sortSourceListItems(items, 'updated').map((row) => row.id)).toEqual(['c', 'a', 'b'])
    expect(sortSourceListItems(items, 'title').map((row) => row.title)).toEqual([
      'アルファ',
      'ガンマ',
      'ベータ',
    ])
  })
})

describe('source list copy helpers', () => {
  it('explains empty search', () => {
    expect(sourceListSearchEmptyCopy('')).toBe('ソースはまだありません')
    expect(sourceListSearchEmptyCopy('PDF')).toBe('「PDF」に一致するソースはありません')
  })

  it('offers question examples', () => {
    expect(QUESTION_EXAMPLES.length).toBeGreaterThanOrEqual(3)
  })
})
