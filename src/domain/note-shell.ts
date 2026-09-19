import { jobProgressView } from '~/domain/job-status-copy'
import type { JobKind, JobStatus } from '~/domain/jobs'
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
      invalidSourceId?: string
    }

export type SourceListKind = 'web' | 'pdf' | 'paste'

export type SourceRowJobChip = {
  tone: 'pending' | 'failure'
  label: string
}

export const INVALID_SOURCE_ID_RECOVERY =
  '指定されたソースが見つからないため、先頭のソースを表示しています。'

export const SOURCE_DELETE_BUSY_REASON = '処理中のため削除できません'
export const SOURCE_DELETING_STATUS = '削除しています'
export const SOURCE_LIST_EMPTY_COPY = 'まだソースがありません。追加すると要約と質問が使えます。'
export const SOURCE_LIST_SELECTED_LABEL = '選択中'

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
  const requested = search.sourceId
  const matched = Boolean(requested && sources.some((row) => row.id === requested))
  const focusSourceId = matched && requested ? requested : sources[0]!.id
  return {
    status: 'ready',
    notebook,
    sources: [...sources],
    focusSourceId,
    ...(requested && !matched ? { invalidSourceId: requested } : {}),
  }
}

export function nextSourceIdAfterDelete(
  sourceIds: readonly string[],
  deletedId: string,
  focusedId?: string,
): string | undefined {
  const remaining = sourceIds.filter((id) => id !== deletedId)
  if (focusedId && focusedId !== deletedId && remaining.includes(focusedId)) {
    return focusedId
  }
  const index = sourceIds.indexOf(deletedId)
  if (index === -1) return remaining[0]
  return remaining[index] ?? remaining[index - 1]
}

export function sourceListKind(source: { kind: string; acquiredVia: string }): SourceListKind {
  if (source.kind === 'pdf') return 'pdf'
  if (source.acquiredVia === 'paste') return 'paste'
  return 'web'
}

export function sourceListKindLabel(kind: SourceListKind): string {
  switch (kind) {
    case 'web':
      return 'Web'
    case 'pdf':
      return 'PDF'
    case 'paste':
      return '貼り付け'
    default: {
      const _never: never = kind
      return _never
    }
  }
}

export function sourceRowJobChip(source: {
  jobStatus: JobStatus | null
  jobKind: JobKind | null
}): SourceRowJobChip | null {
  if (!source.jobStatus || source.jobStatus === 'succeeded') return null
  const view = jobProgressView({
    status: source.jobStatus,
    kind: source.jobKind,
    errorCode: null,
    errorMessage: null,
    hasBody: true,
    hasUrl: true,
  })
  if (view.tone === 'pending' || view.tone === 'failure') {
    return { tone: view.tone, label: view.label }
  }
  return null
}
