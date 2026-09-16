import type {
  NotebookId,
  NotebookRef,
  OrganizationCatalog,
} from '~/domain/organization'
import type { SourceListItem } from '~/domain/source-views'

export type NoteShellSearch = {
  notebookId: NotebookId
  sourceId?: string
}

export type NoteShellView =
  | { status: 'unknown-notebook'; notebookId: NotebookId }
  | { status: 'empty'; notebook: NotebookRef }
  | {
      status: 'ready'
      notebook: NotebookRef
      sources: SourceListItem[]
      focusSourceId: string
    }

export function resolveNoteShellView(
  search: NoteShellSearch,
  catalog: OrganizationCatalog,
  sources: SourceListItem[],
): NoteShellView {
  const notebook = catalog.notebooks.find((row) => row.id === search.notebookId)
  if (!notebook) {
    return { status: 'unknown-notebook', notebookId: search.notebookId }
  }
  if (sources.length === 0) {
    return { status: 'empty', notebook }
  }
  const focusSourceId =
    search.sourceId && sources.some((row) => row.id === search.sourceId)
      ? search.sourceId
      : sources[0]!.id
  return {
    status: 'ready',
    notebook,
    sources,
    focusSourceId,
  }
}
