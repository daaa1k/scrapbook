import { describe, expect, it } from 'vitest'
import { resolveNoteShellView } from '../src/domain/note-shell'
import {
  notebookIdSchema,
  notebookTitleSchema,
  type OrganizationCatalog,
} from '../src/domain/organization'
import { sourceListItemSchema, type SourceListItem } from '../src/domain/source-views'

const notebookId = notebookIdSchema.parse('550e8400-e29b-41d4-a716-446655440000')
const otherNotebookId = notebookIdSchema.parse('660e8400-e29b-41d4-a716-446655440000')
const notebookTitle = notebookTitleSchema.parse('研究')
const notebook = {
  id: notebookId,
  title: notebookTitle,
  isInbox: false as const,
}

function catalogWithNotebook(): OrganizationCatalog {
  return {
    notebooks: [{ ...notebook, sourceCount: 2 }],
    tags: [],
  }
}

function source(id: string, title: string): SourceListItem {
  return sourceListItemSchema.parse({
    id,
    title,
    url: null,
    kind: 'url',
    fetchStatus: 'full',
    acquiredVia: 'paste',
    jobStatus: null,
    jobKind: null,
    createdAt: 1,
    notebook,
    tags: [],
  })
}

describe('resolveNoteShellView', () => {
  it('returns unknown-notebook when the id is missing from the catalog', () => {
    expect(resolveNoteShellView({ notebookId }, { notebooks: [], tags: [] }, [])).toEqual({
      status: 'unknown-notebook',
      notebookId,
    })
    expect(
      resolveNoteShellView(
        { notebookId: otherNotebookId },
        catalogWithNotebook(),
        [source('src-1', '記事')],
      ),
    ).toEqual({
      status: 'unknown-notebook',
      notebookId: otherNotebookId,
    })
  })

  it('returns empty when the notebook exists and the source list is empty', () => {
    const catalog = catalogWithNotebook()
    expect(resolveNoteShellView({ notebookId }, catalog, [])).toEqual({
      status: 'empty',
      notebook: catalog.notebooks[0],
    })
  })

  it('focuses sourceId when it is in the list, otherwise the first listed source', () => {
    const catalog = catalogWithNotebook()
    const first = source('src-1', '一つ目')
    const second = source('src-2', '二つ目')
    const sources = [first, second]
    const notebookRef = catalog.notebooks[0]

    expect(resolveNoteShellView({ notebookId, sourceId: 'src-2' }, catalog, sources)).toEqual({
      status: 'ready',
      notebook: notebookRef,
      sources,
      focusSourceId: 'src-2',
    })
    expect(resolveNoteShellView({ notebookId }, catalog, sources)).toEqual({
      status: 'ready',
      notebook: notebookRef,
      sources,
      focusSourceId: 'src-1',
    })
    expect(resolveNoteShellView({ notebookId, sourceId: 'missing' }, catalog, sources)).toEqual({
      status: 'ready',
      notebook: notebookRef,
      sources,
      focusSourceId: 'src-1',
    })
  })
})
