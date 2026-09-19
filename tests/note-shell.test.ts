import { describe, expect, it } from 'vitest'
import {
  nextSourceIdAfterDelete,
  notebookPanelId,
  notebookPanelIsConcealed,
  notebookStudySwitchAnnouncement,
  notebookTabId,
  paneAfterTabKey,
  resolveNoteShellView,
  sourceListKind,
  sourceListKindLabel,
  sourceRowJobChip,
} from '../src/domain/note-shell'
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
}

function catalogWithNotebook(): OrganizationCatalog {
  return {
    notebooks: [{ ...notebook, sourceCount: 2, updatedAt: 1 }],
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
      invalidSourceId: 'missing',
    })
  })
})

describe('nextSourceIdAfterDelete', () => {
  it('selects the source that occupied the delete index, else the previous', () => {
    expect(nextSourceIdAfterDelete(['a', 'b', 'c'], 'b', 'b')).toBe('c')
    expect(nextSourceIdAfterDelete(['a', 'b', 'c'], 'c', 'c')).toBe('b')
    expect(nextSourceIdAfterDelete(['a', 'b', 'c'], 'a', 'a')).toBe('b')
    expect(nextSourceIdAfterDelete(['a'], 'a', 'a')).toBe(undefined)
  })

  it('keeps the focused source when a different row is deleted', () => {
    expect(nextSourceIdAfterDelete(['a', 'b', 'c'], 'b', 'a')).toBe('a')
    expect(nextSourceIdAfterDelete(['a', 'b', 'c'], 'a', 'c')).toBe('c')
  })
})

describe('source list kind and row job chip', () => {
  it('maps PDF, paste, and fetched URL to list kinds', () => {
    expect(sourceListKind({ kind: 'pdf', acquiredVia: 'upload' })).toBe('pdf')
    expect(sourceListKindLabel(sourceListKind({ kind: 'pdf', acquiredVia: 'upload' }))).toBe('PDF')
    expect(sourceListKind({ kind: 'url', acquiredVia: 'paste' })).toBe('paste')
    expect(sourceListKindLabel('paste')).toBe('貼り付け')
    expect(sourceListKind({ kind: 'url', acquiredVia: 'fetch' })).toBe('web')
    expect(sourceListKind({ kind: 'x', acquiredVia: 'fetch' })).toBe('web')
    expect(sourceListKindLabel('web')).toBe('Web')
  })

  it('shows pending or failed job copy on the row and hides succeeded', () => {
    expect(sourceRowJobChip({ jobStatus: 'queued', jobKind: 'fetch' })).toEqual({
      tone: 'pending',
      label: '本文の取得を準備しています',
    })
    expect(sourceRowJobChip({ jobStatus: 'failed', jobKind: 'summarize_body' })).toEqual({
      tone: 'failure',
      label: '要約できませんでした',
    })
    expect(sourceRowJobChip({ jobStatus: 'succeeded', jobKind: 'ask_source' })).toBe(null)
    expect(sourceRowJobChip({ jobStatus: null, jobKind: null })).toBe(null)
  })
})

describe('paneAfterTabKey', () => {
  it('moves across the three panes and wraps at the ends', () => {
    expect(paneAfterTabKey('sources', 'ArrowRight')).toBe('study')
    expect(paneAfterTabKey('study', 'ArrowRight')).toBe('memo')
    expect(paneAfterTabKey('memo', 'ArrowRight')).toBe('sources')
    expect(paneAfterTabKey('sources', 'ArrowLeft')).toBe('memo')
    expect(paneAfterTabKey('study', 'ArrowLeft')).toBe('sources')
    expect(paneAfterTabKey('memo', 'ArrowLeft')).toBe('study')
  })

  it('jumps to the first or last pane on Home and End', () => {
    expect(paneAfterTabKey('memo', 'Home')).toBe('sources')
    expect(paneAfterTabKey('sources', 'End')).toBe('memo')
    expect(paneAfterTabKey('study', 'Home')).toBe('sources')
    expect(paneAfterTabKey('study', 'End')).toBe('memo')
  })

  it('ignores keys that are not part of the tablist pattern', () => {
    expect(paneAfterTabKey('study', 'ArrowDown')).toBe(null)
    expect(paneAfterTabKey('study', 'Tab')).toBe(null)
    expect(paneAfterTabKey('study', 'Enter')).toBe(null)
  })
})

describe('notebookPanelIsConcealed', () => {
  it('conceals only unselected panes in the compact layout', () => {
    expect(notebookPanelIsConcealed('sources', 'study', true)).toBe(true)
    expect(notebookPanelIsConcealed('study', 'study', true)).toBe(false)
    expect(notebookPanelIsConcealed('memo', 'study', true)).toBe(true)
  })

  it('shows every pane in the expanded layout', () => {
    expect(notebookPanelIsConcealed('sources', 'study', false)).toBe(false)
    expect(notebookPanelIsConcealed('memo', 'memo', false)).toBe(false)
  })
})

describe('notebook tab ids and study switch copy', () => {
  it('names the study tab, panel, and source-driven announcement', () => {
    expect(notebookTabId('study')).toBe('notebook-tab-study')
    expect(notebookPanelId('memo')).toBe('notebook-panel-memo')
    expect(notebookStudySwitchAnnouncement('記事')).toBe('記事を選び、要約・質問を表示しています')
  })
})
