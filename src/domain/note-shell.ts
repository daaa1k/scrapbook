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

export const NOTEBOOK_MOBILE_PANES = ['sources', 'study', 'memo'] as const
export type NotebookMobilePane = (typeof NOTEBOOK_MOBILE_PANES)[number]

export const NOTEBOOK_MOBILE_TABS = [
  { id: 'sources', label: 'ソース' },
  { id: 'study', label: '要約・質問' },
  { id: 'memo', label: 'メモ' },
] as const satisfies ReadonlyArray<{ id: NotebookMobilePane; label: string }>

export const NOTEBOOK_SOURCE_STUDY_HINT_ID = 'notebook-source-study-hint'
export const NOTEBOOK_SOURCE_STUDY_HINT = 'ソースを選ぶと要約・質問タブに切り替わります'

export function notebookTabId(pane: NotebookMobilePane): `notebook-tab-${NotebookMobilePane}` {
  return `notebook-tab-${pane}`
}

export function notebookPanelId(pane: NotebookMobilePane): `notebook-panel-${NotebookMobilePane}` {
  return `notebook-panel-${pane}`
}

export function paneAfterTabKey(current: NotebookMobilePane, key: string): NotebookMobilePane | null {
  const index = NOTEBOOK_MOBILE_PANES.indexOf(current)
  if (index === -1) return null
  const last = NOTEBOOK_MOBILE_PANES.length - 1
  if (key === 'ArrowLeft') return NOTEBOOK_MOBILE_PANES[index === 0 ? last : index - 1]!
  if (key === 'ArrowRight') return NOTEBOOK_MOBILE_PANES[index === last ? 0 : index + 1]!
  if (key === 'Home') return NOTEBOOK_MOBILE_PANES[0]
  if (key === 'End') return NOTEBOOK_MOBILE_PANES[last]!
  return null
}

export function notebookPanelIsConcealed(
  pane: NotebookMobilePane,
  selected: NotebookMobilePane,
  compact: boolean,
): boolean {
  return compact && pane !== selected
}

export function notebookStudySwitchAnnouncement(sourceLabel: string): string {
  return `${sourceLabel}を選び、要約・質問を表示しています`
}

export function resolveNoteShellView(
  search: NoteShellSearch,
  catalog: OrganizationCatalog,
  sources: readonly SourceListItem[],
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
    sources: [...sources],
    focusSourceId,
  }
}
