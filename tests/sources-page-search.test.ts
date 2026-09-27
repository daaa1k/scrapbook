import { describe, expect, it } from 'vitest'
import {
  EMPTY_SOURCE_LIST_FILTER,
  organizationCommandSchema,
  parseSourcesPageSearch,
  sourceListFilterFromSourcesPageSearch,
} from '../src/domain/organization'

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
})
