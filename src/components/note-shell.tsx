import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  focusNotebookTab,
  MobileNotebookTabs,
  notebookPanelConcealmentProps,
  useNotebookLayoutMode,
} from '~/components/mobile-notebook-tabs'
import { SourceInvestigate } from '~/components/source-investigate'
import { SourceMemoPane } from '~/components/source-memo-pane'
import { SourceModal } from '~/components/source-modal'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { ConfirmDialog } from '~/components/ui/confirm-dialog'
import { EmptyState } from '~/components/ui/empty-state'
import { ErrorRetry } from '~/components/ui/error-retry'
import { Input } from '~/components/ui/input'
import { LoadingSkeleton, PendingMark } from '~/components/ui/loading-skeleton'
import { ShortcutHelpDialog } from '~/components/ui/shortcut-help-dialog'
import { asyncResourceView } from '~/domain/async-view'
import { sourceDeleteConfirm } from '~/domain/destructive-confirm'
import { clearLastSourceSelection, readLastSourceSelection, resumableSourceId, writeLastSourceSelection } from '~/domain/last-source-selection'
import { isLeavingMemoSource, type MemoSessionHandle } from '~/domain/memo-save'
import {
  CATALOG_LOADING_LABEL,
  INVALID_SOURCE_ID_RECOVERY,
  MEMO_LOADING_LABEL,
  NOTEBOOK_SOURCES_DRAWER_OPEN_LABEL,
  NOTEBOOK_SOURCE_STUDY_HINT,
  NOTEBOOK_SOURCE_STUDY_HINT_ID,
  SOURCE_DELETE_BUSY_REASON,
  SOURCE_DELETING_STATUS,
  SOURCE_LIST_EMPTY_COPY,
  SOURCE_LIST_LOAD_ERROR,
  SOURCE_LIST_SELECTED_LABEL,
  SOURCES_LOADING_LABEL,
  STUDY_LOADING_LABEL,
  cancelNotebookTitleEdit,
  nextSourceIdAfterDelete,
  notebookPanelId,
  notebookPanelIsConcealed,
  notebookStudySwitchAnnouncement,
  notebookTitleCommit,
  notebookTitleDraftChanged,
  resolveNoteShellFrame,
  resolveNoteShellResults,
  sourceListKind,
  sourceListKindLabel,
  sourceRowJobChip,
  startNotebookTitleEdit,
  type NotebookMobilePane,
  type NotebookTitleEditor,
  type NoteShellSearch,
  type SourceListKind,
} from '~/domain/note-shell'
import { sourceListFilterFromSourcesPageSearch } from '~/domain/organization'
import { EMPTY_SOURCE_INPUT_DRAFT, type SourceInputDraft } from '~/domain/source-input-drafts'
import {
  SOURCE_LIST_SORT_DEFAULT,
  SOURCE_LIST_SORT_LABELS,
  sortSourceListItems,
  sourceListSearchEmptyCopy,
  type SourceListSort,
} from '~/domain/source-list-controls'
import {
  canHandleNoteShortcut,
  isShortcutHelpKey,
  SHORTCUT_HELP_TRIGGER_LABEL,
  sourceNavDirection,
} from '~/domain/shortcuts'
import type { SourceListItem } from '~/domain/source-views'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { cn, isTerminalJobStatus, userFacingError } from '~/lib/utils'
import { getOrganizationCatalog, runOrganizationCommand } from '~/server/functions/organization'
import { deleteRegisteredSource, listSources } from '~/server/functions/sources'

const PANE_HEADING_CLASS =
  'sticky top-0 z-[1] mb-stack bg-inherit py-1 text-status font-medium text-muted'
const PANE_SURFACE_SIDE =
  'min-h-0 overflow-y-auto rounded-md bg-surface-muted p-inset'
const PANE_SURFACE_MAIN =
  'min-h-0 overflow-y-auto rounded-md bg-surface p-inset'

function notebookIdFromParams(params: object): string | undefined {
  if (!('notebookId' in params)) return undefined
  const id = params.notebookId
  return typeof id === 'string' ? id : undefined
}

function sourceIdFromSearch(search: object): string | undefined {
  if (!('sourceId' in search)) return undefined
  return typeof search.sourceId === 'string' ? search.sourceId : undefined
}

export function NoteShell({ notebookId, sourceId }: NoteShellSearch) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, SourceInputDraft>>({})
  const updateSourceDraft = useCallback((id: string, update: (draft: SourceInputDraft) => SourceInputDraft) => {
    setSourceDrafts((drafts) => ({ ...drafts, [id]: update(drafts[id] ?? EMPTY_SOURCE_INPUT_DRAFT) }))
  }, [])
  const [titleEditor, setTitleEditor] = useState<NotebookTitleEditor>({ status: 'viewing' })
  const [renameError, setRenameError] = useState<string | null>(null)
  const [paneError, setPaneError] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const renameButtonRef = useRef<HTMLButtonElement>(null)
  const restoreRenameFocusRef = useRef(false)
  const memoSessionRef = useRef<MemoSessionHandle | null>(null)
  const resumeAttemptRef = useRef<string | null>(null)
  const activeSessionRef = useRef(true)
  useEffect(() => {
    activeSessionRef.current = true
    return () => {
      activeSessionRef.current = false
    }
  }, [])
  const registerMemoSession = useCallback((session: MemoSessionHandle) => {
    memoSessionRef.current = session
  }, [])
  const [mobilePane, setMobilePane] = useState<NotebookMobilePane>('study')
  const [paneAnnounce, setPaneAnnounce] = useState('')
  const [pendingSource, setPendingSource] = useState<{ id: string; label: string } | null>(null)
  const [sourcesDrawerOpen, setSourcesDrawerOpen] = useState(false)
  const drawerRef = useRef<HTMLDialogElement>(null)
  const drawerTriggerRef = useRef<HTMLButtonElement>(null)
  const focusStudyAfterDrawerRef = useRef(false)
  const [sourceSearch, setSourceSearch] = useState('')
  const [sourceSort, setSourceSort] = useState<SourceListSort>(SOURCE_LIST_SORT_DEFAULT)
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const deferredSourceSearch = useDeferredValue(sourceSearch.trim())
  const layoutMode = useNotebookLayoutMode()
  const tabsLayout = layoutMode === 'tabs'
  const drawerLayout = layoutMode === 'drawer'
  const splitLayout = layoutMode === 'split'

  useEffect(() => {
    if (!drawerLayout) setSourcesDrawerOpen(false)
  }, [drawerLayout])

  useEffect(() => {
    const dialog = drawerRef.current
    if (!dialog || !drawerLayout || !sourcesDrawerOpen) return
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>('[data-drawer-close]')?.focus()
    return () => {
      dialog.close()
      const study = document.getElementById('notebook-study-heading')
      const trigger = drawerTriggerRef.current
      if (focusStudyAfterDrawerRef.current) {
        study?.focus()
      } else if (trigger?.isConnected && trigger.getClientRects().length > 0) {
        trigger.focus()
      } else if (study?.getClientRects().length) {
        study.focus()
      } else {
        focusNotebookTab('study')
      }
      focusStudyAfterDrawerRef.current = false
    }
  }, [drawerLayout, sourcesDrawerOpen])

  const shouldBlockLeave = useCallback(async (args: { current: { params: object; search: object }; next: { params: object; search: object } }) => {
    if (!isLeavingMemoSource(
      { notebookId: notebookIdFromParams(args.current.params), sourceId: sourceIdFromSearch(args.current.search) },
      { notebookId: notebookIdFromParams(args.next.params), sourceId: sourceIdFromSearch(args.next.search) },
    )) {
      return false
    }
    const session = memoSessionRef.current
    if (!session?.needsGuard) return false
    try {
      await session.flush()
      return false
    } catch {
      return true
    }
  }, [])

  const enableBeforeUnload = useCallback(() => memoSessionRef.current?.needsGuard ?? false, [])

  const blocker = useBlocker({
    shouldBlockFn: shouldBlockLeave,
    enableBeforeUnload,
    withResolver: true,
  })

  async function retryLeave() {
    if (blocker.status !== 'blocked') return
    try {
      await memoSessionRef.current?.flush()
      blocker.proceed()
    } catch {
      return
    }
  }

  function discardAndLeave() {
    if (blocker.status !== 'blocked') return
    memoSessionRef.current?.discard()
    blocker.proceed()
  }

  const notebookFilter = sourceListFilterFromSourcesPageSearch({ notebookId })
  const searchFilter = {
    ...notebookFilter,
    q: deferredSourceSearch,
  }

  const catalog = useQuery({
    queryKey: organizationKeys.catalog,
    queryFn: () => getOrganizationCatalog(),
  })

  const notebookSourcesQuery = useQuery({
    queryKey: sourceKeys.list(notebookFilter),
    queryFn: () => listSources({ data: notebookFilter }),
  })

  const searchQuery = useQuery({
    queryKey: sourceKeys.list(searchFilter),
    queryFn: () => listSources({ data: searchFilter }),
    enabled: deferredSourceSearch !== '',
  })

  const frame = resolveNoteShellFrame(
    { notebookId, sourceId },
    asyncResourceView({
      data: catalog.data,
      isError: catalog.isError,
      isFetching: catalog.isFetching,
    }),
    asyncResourceView({
      data: notebookSourcesQuery.data,
      isError: notebookSourcesQuery.isError,
      isFetching: notebookSourcesQuery.isFetching,
    }),
  )

  const searchResults = resolveNoteShellResults(
    asyncResourceView({
      data: deferredSourceSearch === '' ? notebookSourcesQuery.data : searchQuery.data,
      isError: deferredSourceSearch === '' ? notebookSourcesQuery.isError : searchQuery.isError,
      isFetching: deferredSourceSearch === '' ? notebookSourcesQuery.isFetching : searchQuery.isFetching,
    }),
  )

  const sortedSources = useMemo(
    () => (searchResults.status === 'ready' ? sortSourceListItems(searchResults.sources, sourceSort) : []),
    [searchResults, sourceSort],
  )

  useEffect(() => {
    if (sourceId) {
      resumeAttemptRef.current = null
      return
    }
    if (frame.status !== 'ready') return
    const stored = readLastSourceSelection(notebookId)
    const resumable = resumableSourceId(stored, frame.sources.map((source) => source.id))
    if (!resumable) {
      if (stored) clearLastSourceSelection(notebookId)
      return
    }
    if (resumeAttemptRef.current === resumable) return
    resumeAttemptRef.current = resumable
    void navigate({ to: '/notebooks/$notebookId', params: { notebookId },
      search: { sourceId: resumable }, replace: true })
  }, [sourceId, notebookId, frame, navigate])

  useEffect(() => {
    if (titleEditor.status === 'editing') {
      const input = titleInputRef.current
      if (!input) return
      input.focus()
      input.select()
      return
    }
    if (!restoreRenameFocusRef.current) return
    restoreRenameFocusRef.current = false
    renameButtonRef.current?.focus()
  }, [titleEditor.status])

  function closeTitleEditor() {
    setRenameError(null)
    restoreRenameFocusRef.current = true
    setTitleEditor(cancelNotebookTitleEdit())
  }

  const rename = useMutation({
    mutationFn: ({ targetNotebookId, title }: { targetNotebookId: NoteShellSearch['notebookId']; title: string }) =>
      runOrganizationCommand({ data: { type: 'rename-notebook', notebookId: targetNotebookId, title } }),
    onSuccess: async () => {
      if (activeSessionRef.current) closeTitleEditor()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      ])
    },
    onError: (error) => {
      if (activeSessionRef.current) setRenameError(userFacingError(error))
    },
  })

  const removeSource = useMutation({
    mutationFn: ({ deletedId }: { targetNotebookId: NoteShellSearch['notebookId']; deletedId: string; nextId?: string }) =>
      deleteRegisteredSource({ data: { sourceId: deletedId } }),
    onSuccess: async (_result, { targetNotebookId, deletedId, nextId }) => {
      if (readLastSourceSelection(targetNotebookId) === deletedId) clearLastSourceSelection(targetNotebookId)
      setSourceDrafts((drafts) => {
        const next = { ...drafts }
        delete next[deletedId]
        return next
      })
      if (activeSessionRef.current) setPaneError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
      ])
      if (!activeSessionRef.current) return
      await navigate({
        to: '/notebooks/$notebookId',
        params: { notebookId: targetNotebookId },
        search: nextId ? { sourceId: nextId } : {},
      })
    },
    onError: (error) => {
      if (activeSessionRef.current) setPaneError(userFacingError(error))
    },
  })
  const deletingSourceId = removeSource.isPending ? removeSource.variables.deletedId : undefined

  async function focusSource(nextSourceId: string) {
    if (frame.status === 'ready' && frame.focusSourceId === nextSourceId) return
    try {
      await memoSessionRef.current?.flush()
    } catch {
      return
    }
    await navigate({
      to: '/notebooks/$notebookId',
      params: { notebookId },
      search: { sourceId: nextSourceId },
    })
    writeLastSourceSelection(notebookId, nextSourceId)
  }

  function focusListedSource(source: SourceListItem) {
    void focusSource(source.id)
    setMobilePane('study')
    if (tabsLayout) {
      const label = source.title ?? source.url ?? source.id
      setPaneAnnounce(notebookStudySwitchAnnouncement(label))
      focusNotebookTab('study')
    }
    if (drawerLayout) {
      focusStudyAfterDrawerRef.current = true
      setSourcesDrawerOpen(false)
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (sourcesDrawerOpen || !canHandleNoteShortcut(event, document.querySelector('dialog:modal') !== null)) return
      if (isShortcutHelpKey(event)) {
        event.preventDefault()
        setShortcutHelpOpen(true)
        return
      }
      const direction = sourceNavDirection(event)
      if (!direction) return
      if (frame.status !== 'ready' || sortedSources.length === 0) return
      const ids = sortedSources.map((row) => row.id)
      const index = ids.indexOf(frame.focusSourceId)
      if (index < 0) return
      const nextIndex = direction === 'next' ? index + 1 : index - 1
      if (nextIndex < 0 || nextIndex >= ids.length) return
      event.preventDefault()
      const next = sortedSources[nextIndex]
      if (next) focusListedSource(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (frame.status === 'catalog-loading' || frame.status === 'catalog-error') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-gap">
        <header className="shrink-0 space-y-stack border-b border-border pb-stack">
          <NotebookBreadcrumb current="ノート" />
          {frame.status === 'catalog-error' ? (
            <ErrorRetry onRetry={() => void catalog.refetch()}>
              {userFacingError(catalog.error)}
            </ErrorRetry>
          ) : (
            <LoadingSkeleton label={CATALOG_LOADING_LABEL} lines={2} />
          )}
        </header>
        {frame.status === 'catalog-loading' ? (
          <div
            className={cn(
              'grid min-h-0 flex-1 gap-gap',
              splitLayout &&
                'grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)_minmax(10rem,18rem)]',
              drawerLayout && 'grid-cols-[minmax(0,1fr)_minmax(11rem,18rem)]',
            )}
          >
            {splitLayout ? <LoadingSkeleton label={SOURCES_LOADING_LABEL} /> : null}
            <LoadingSkeleton label={STUDY_LOADING_LABEL} />
            <LoadingSkeleton label={MEMO_LOADING_LABEL} />
          </div>
        ) : null}
      </div>
    )
  }

  if (frame.status === 'unknown-notebook') {
    return (
      <div className="space-y-section">
        <NotebookBreadcrumb current="ノートが見つかりません" />
        <h1 className="text-heading font-semibold tracking-tight">ノートが見つかりません</h1>
      </div>
    )
  }

  const view = frame
  const paneGridClass = cn(
    'grid min-h-0 flex-1 gap-gap',
    splitLayout && 'grid-cols-[minmax(10rem,16rem)_minmax(0,1fr)_minmax(10rem,18rem)]',
    drawerLayout && 'grid-cols-[minmax(0,1fr)_minmax(11rem,18rem)]',
  )

  const sourcesBody = (
    <>
      <div className="mb-stack flex items-start justify-between gap-2">
        <h2 id="notebook-sources-heading" className={PANE_HEADING_CLASS}>
          ソース
        </h2>
        {drawerLayout ? (
          <Button type="button" variant="ghost" size="sm" data-drawer-close="" onClick={() => setSourcesDrawerOpen(false)}>
            閉じる
          </Button>
        ) : null}
      </div>
      {tabsLayout ? (
        <p id={NOTEBOOK_SOURCE_STUDY_HINT_ID} className="sr-only">
          {NOTEBOOK_SOURCE_STUDY_HINT}
        </p>
      ) : null}
      {view.status === 'ready' && view.invalidSourceId ? (
        <Alert id="notebook-invalid-source" className="mb-stack">
          {INVALID_SOURCE_ID_RECOVERY}
        </Alert>
      ) : null}
      <div className="space-y-stack">
        <div className="space-y-2">
          <div>
            <label htmlFor="notebook-source-search" className="mb-1 block text-meta font-medium text-muted">
              検索
            </label>
            <Input
              id="notebook-source-search"
              type="search"
              value={sourceSearch}
              onChange={(event) => setSourceSearch(event.target.value)}
              placeholder="タイトルや本文で検索"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="notebook-source-sort" className="mb-1 block text-meta font-medium text-muted">
              並び替え
            </label>
            <select
              id="notebook-source-sort"
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-ink"
              value={sourceSort}
              onChange={(event) => setSourceSort(event.target.value as SourceListSort)}
            >
              {(Object.keys(SOURCE_LIST_SORT_LABELS) as SourceListSort[]).map((key) => (
                <option key={key} value={key}>
                  {SOURCE_LIST_SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {searchResults.status === 'loading' ? (
          <LoadingSkeleton label={SOURCES_LOADING_LABEL} lines={4} />
        ) : searchResults.status === 'error' ? (
          <ErrorRetry onRetry={() => void (deferredSourceSearch === '' ? notebookSourcesQuery : searchQuery).refetch()}>
            {userFacingError(deferredSourceSearch === '' ? notebookSourcesQuery.error : searchQuery.error)}
          </ErrorRetry>
        ) : view.status === 'empty' && deferredSourceSearch === '' ? (
          <EmptyState
            title={SOURCE_LIST_EMPTY_COPY}
            action={
              <Button type="button" onClick={() => setModalOpen(true)}>
                ソースを追加
              </Button>
            }
          />
        ) : sortedSources.length === 0 ? (
          <p className="text-sm text-muted">{sourceListSearchEmptyCopy(deferredSourceSearch)}</p>
        ) : (
          <ul className="space-y-2">
            {sortedSources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                focused={view.status === 'ready' && source.id === view.focusSourceId}
                compact={tabsLayout}
                deleting={deletingSourceId === source.id}
                onFocus={() => focusListedSource(source)}
                onDelete={() => {
                  const label = source.title ?? source.url ?? source.id
                  setPendingSource({ id: source.id, label })
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-gap">
      <header className="shrink-0 space-y-stack border-b border-border bg-canvas pb-stack">
        <NotebookBreadcrumb current={view.notebook.title} />
        {blocker.status === 'blocked' ? (
          <div
            role="alertdialog"
            aria-labelledby="memo-leave-title"
            aria-describedby="memo-leave-desc"
            className="space-y-stack rounded-md border border-danger-border bg-danger-subtle p-inset text-body"
          >
            <p id="memo-leave-title" className="font-medium text-danger-subtle-ink">
              メモを保存できませんでした
            </p>
            <p id="memo-leave-desc">再試行するか、変更を破棄して移動できます。</p>
            <div className="flex gap-gap">
              <button type="button" className="underline" onClick={() => void retryLeave()}>
                再試行
              </button>
              <button type="button" className="underline" onClick={discardAndLeave}>
                破棄
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-gap">
          {titleEditor.status === 'viewing' ? (
            <div className="min-w-0 flex-1 space-y-2">
              <h1 className="break-anywhere text-heading font-semibold tracking-tight">{view.notebook.title}</h1>
              <Button
                ref={renameButtonRef}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRenameError(null)
                  setTitleEditor(startNotebookTitleEdit(view.notebook.title))
                }}
              >
                名前を変更
              </Button>
            </div>
          ) : (
            <form
              className="flex min-w-0 flex-1 flex-col gap-gap sm:flex-row sm:items-start"
              onSubmit={(event) => {
                event.preventDefault()
                const intent = notebookTitleCommit(titleEditor.draft, view.notebook.title)
                if (intent.action === 'invalid') {
                  setRenameError('ノート名を入力してください')
                  return
                }
                if (intent.action === 'unchanged') {
                  closeTitleEditor()
                  return
                }
                rename.mutate({ targetNotebookId: notebookId, title: intent.title })
              }}
            >
              <h1 className="sr-only">{view.notebook.title}</h1>
              <Input
                ref={titleInputRef}
                name="notebook-title"
                required
                maxLength={100}
                value={titleEditor.draft}
                disabled={rename.isPending}
                onChange={(event) => {
                  setRenameError(null)
                  setTitleEditor(notebookTitleDraftChanged(event.target.value))
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return
                  event.preventDefault()
                  closeTitleEditor()
                }}
                aria-label="ノート名"
                aria-invalid={renameError ? true : undefined}
                aria-describedby={renameError ? 'notebook-rename-error' : undefined}
                aria-busy={rename.isPending || undefined}
                className="text-title font-semibold"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" variant="secondary" disabled={rename.isPending}>
                  保存
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={rename.isPending}
                  onClick={closeTitleEditor}
                >
                  キャンセル
                </Button>
              </div>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShortcutHelpOpen(true)}
              aria-haspopup="dialog"
            >
              {SHORTCUT_HELP_TRIGGER_LABEL}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(true)}>
              ソースを追加
            </Button>
          </div>
        </div>
        {renameError ? <Alert id="notebook-rename-error">{renameError}</Alert> : null}
        {paneError ? <Alert id="notebook-pane-error">{paneError}</Alert> : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-gap">
        {tabsLayout ? <MobileNotebookTabs selected={mobilePane} onSelect={setMobilePane} /> : null}
        {drawerLayout ? (
          <div className="shrink-0">
            <Button ref={drawerTriggerRef} type="button" variant="secondary" size="sm" onClick={() => setSourcesDrawerOpen(true)}>
              {NOTEBOOK_SOURCES_DRAWER_OPEN_LABEL}
            </Button>
          </div>
        ) : null}
        <p role="status" className="sr-only">
          {paneAnnounce}
        </p>

        <div className={paneGridClass}>
          {splitLayout || tabsLayout ? (
            <aside
              id={notebookPanelId('sources')}
              role="tabpanel"
              aria-labelledby="notebook-sources-heading"
              {...notebookPanelConcealmentProps(
                notebookPanelIsConcealed('sources', mobilePane, layoutMode, sourcesDrawerOpen),
              )}
              className={cn(
                PANE_SURFACE_SIDE,
                tabsLayout && (mobilePane === 'sources' ? 'block' : 'hidden'),
                splitLayout && 'block',
              )}
            >
              {sourcesBody}
            </aside>
          ) : null}

          <section
            id={notebookPanelId('study')}
            role="tabpanel"
            aria-labelledby="notebook-study-heading"
            {...notebookPanelConcealmentProps(
              notebookPanelIsConcealed('study', mobilePane, layoutMode, sourcesDrawerOpen),
            )}
            className={cn(
              PANE_SURFACE_MAIN,
              tabsLayout && (mobilePane === 'study' ? 'block' : 'hidden'),
              (drawerLayout || splitLayout) && 'block',
            )}
          >
            <h2 id="notebook-study-heading" tabIndex={-1} className={PANE_HEADING_CLASS}>
              要約・質問
            </h2>
            {view.status === 'ready' ? (
              <SourceInvestigate
                key={view.focusSourceId}
                sourceId={view.focusSourceId}
                draft={sourceDrafts[view.focusSourceId] ?? EMPTY_SOURCE_INPUT_DRAFT}
                updateDraft={updateSourceDraft}
              />
            ) : view.status === 'sources-loading' ? (
              <LoadingSkeleton label={STUDY_LOADING_LABEL} lines={4} />
            ) : view.status === 'sources-error' ? (
              <ErrorRetry onRetry={() => void notebookSourcesQuery.refetch()}>
                {SOURCE_LIST_LOAD_ERROR}
              </ErrorRetry>
            ) : (
              <p className="text-status text-muted">{SOURCE_LIST_EMPTY_COPY}</p>
            )}
          </section>

          <aside
            id={notebookPanelId('memo')}
            role="tabpanel"
            aria-labelledby="notebook-memo-heading"
            {...notebookPanelConcealmentProps(
              notebookPanelIsConcealed('memo', mobilePane, layoutMode, sourcesDrawerOpen),
            )}
            className={cn(
              PANE_SURFACE_SIDE,
              tabsLayout && (mobilePane === 'memo' ? 'block' : 'hidden'),
              (drawerLayout || splitLayout) && 'block',
            )}
          >
            {view.status === 'ready' ? (
              <SourceMemoPane
                key={view.focusSourceId}
                sourceId={view.focusSourceId}
                registerMemoSession={registerMemoSession}
              />
            ) : (
              <>
                <h2 id="notebook-memo-heading" className={PANE_HEADING_CLASS}>
                  メモ
                </h2>
                {view.status === 'sources-loading' ? (
                  <LoadingSkeleton label={MEMO_LOADING_LABEL} lines={3} />
                ) : view.status === 'sources-error' ? (
                  <ErrorRetry onRetry={() => void notebookSourcesQuery.refetch()}>
                    {SOURCE_LIST_LOAD_ERROR}
                  </ErrorRetry>
                ) : (
                  <p className="text-status text-muted">ソースを選ぶとメモを書けます。</p>
                )}
              </>
            )}
          </aside>
        </div>

        {drawerLayout ? (
          <dialog
            ref={drawerRef}
            id={notebookPanelId('sources')}
            aria-modal="true"
            aria-labelledby="notebook-sources-heading"
            {...notebookPanelConcealmentProps(
              notebookPanelIsConcealed('sources', mobilePane, layoutMode, sourcesDrawerOpen),
            )}
            className={cn(
              PANE_SURFACE_SIDE,
              'fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,92vw)] max-w-none rounded-none border-0 text-ink shadow-xl backdrop:bg-overlay',
              sourcesDrawerOpen ? 'flex flex-col' : 'hidden',
            )}
            onCancel={(event) => {
              event.preventDefault()
              setSourcesDrawerOpen(false)
            }}
            onClick={(event) => {
              if (event.target !== event.currentTarget) return
              if (event.clientX > event.currentTarget.getBoundingClientRect().right) {
                setSourcesDrawerOpen(false)
              }
            }}
          >
            {sourcesBody}
          </dialog>
        ) : null}
      </div>

      {pendingSource ? (
        <ConfirmDialog
          open
          {...sourceDeleteConfirm(pendingSource.label)}
          tone="danger"
          onCancel={() => setPendingSource(null)}
          onConfirm={() => {
            const deletedId = pendingSource.id
            const ids = view.status === 'ready' ? view.sources.map((row) => row.id) : []
            const focusedId = view.status === 'ready' ? view.focusSourceId : undefined
            const nextId = nextSourceIdAfterDelete(ids, deletedId, focusedId)
            setPendingSource(null)
            removeSource.mutate({ targetNotebookId: notebookId, deletedId, nextId })
          }}
        />
      ) : null}
      <SourceModal
        notebook={notebookId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSourceAdded={async ({ sourceId: addedSourceId }) => {
          try {
            await memoSessionRef.current?.flush()
          } catch {
            return false
          }
          if (!activeSessionRef.current) return false
          setModalOpen(false)
          await navigate({
            to: '/notebooks/$notebookId',
            params: { notebookId },
            search: { sourceId: addedSourceId },
          })
          return true
        }}
      />
      <ShortcutHelpDialog open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
    </div>
  )
}

function NotebookBreadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="パンくず">
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1 p-0 text-meta text-muted">
        <li>
          <Link to="/" className="hover:underline">
            ホーム
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="min-w-0 break-anywhere text-ink">
          {current}
        </li>
      </ol>
    </nav>
  )
}

function SourceKindMark({ kind }: { kind: SourceListKind }) {
  const label = sourceListKindLabel(kind)
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-meta text-muted">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {kind === 'pdf' ? (
          <>
            <path d="M4.25 2.25h5.5L12.75 5.25v8.5H4.25z" />
            <path d="M9.75 2.25v3h3" />
          </>
        ) : kind === 'paste' ? (
          <>
            <rect x="4.25" y="3.25" width="7.5" height="10.5" rx="1" />
            <path d="M6.25 3.25V2.5a1.75 1.75 0 0 1 3.5 0v.75" />
          </>
        ) : (
          <>
            <circle cx="8" cy="8" r="5.5" />
            <path d="M2.5 8h11M8 2.5c1.6 1.8 2.4 3.6 2.4 5.5S9.6 11.7 8 13.5C6.4 11.7 5.6 9.9 5.6 8S6.4 4.3 8 2.5z" />
          </>
        )}
      </svg>
      {label}
    </span>
  )
}

function SourceRow({
  source,
  focused,
  compact,
  deleting,
  onFocus,
  onDelete,
}: {
  source: SourceListItem
  focused: boolean
  compact: boolean
  deleting: boolean
  onFocus: () => void
  onDelete: () => void
}) {
  const kind = sourceListKind(source)
  const chip = sourceRowJobChip(source)
  const busy = Boolean(source.jobStatus && !isTerminalJobStatus(source.jobStatus))
  const label = source.title ?? source.url ?? source.id
  const busyReasonId = `${source.id}-delete-busy`
  return (
    <li>
      <div
        className={
          focused
            ? 'rounded-md border border-inverse bg-surface p-2'
            : 'rounded-md border border-transparent p-2 hover:border-border hover:bg-surface-muted active:bg-surface-muted'
        }
        aria-busy={deleting || undefined}
      >
        <div className="flex min-w-0 items-start gap-1">
          <div className="min-w-0 flex-1 space-y-1">
            <SourceKindMark kind={kind} />
            <button
              type="button"
              className="w-full text-left text-body"
              title={label}
              aria-current={focused ? 'true' : undefined}
              aria-describedby={compact ? NOTEBOOK_SOURCE_STUDY_HINT_ID : undefined}
              onClick={onFocus}
            >
              <span className={`line-clamp-2 break-anywhere ${focused ? 'font-bold' : ''}`}>{label}</span>
              {focused ? (
                <span className="mt-0.5 block text-meta font-medium text-muted">
                  {SOURCE_LIST_SELECTED_LABEL}
                </span>
              ) : null}
            </button>
          </div>
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="tap-target inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted hover:text-ink"
              aria-label={`${label}を新しいタブで開く`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6.5 3.25H3.75A1.5 1.5 0 0 0 2.25 4.75v7.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V9.5" />
                <path d="M9.25 2.25h4.5v4.5M13.75 2.25 8 8" />
              </svg>
            </a>
          ) : null}
          {deleting ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-meta text-muted">
              <PendingMark />
              {SOURCE_DELETING_STATUS}
            </span>
          ) : (
            <SourceRowMenu
              label={label}
              busy={busy}
              busyReasonId={busyReasonId}
              onDelete={onDelete}
            />
          )}
        </div>
        {chip ? (
          <p
            className={`mt-2 flex items-center gap-2 text-meta ${
              chip.tone === 'failure' ? 'text-danger' : 'text-muted'
            }`}
          >
            {chip.tone === 'pending' ? <PendingMark /> : null}
            {chip.label}
          </p>
        ) : null}
        {busy ? (
          <p id={busyReasonId} className="mt-1 text-meta text-muted">
            {SOURCE_DELETE_BUSY_REASON}
          </p>
        ) : null}
      </div>
    </li>
  )
}

function SourceRowMenu({
  label,
  busy,
  busyReasonId,
  onDelete,
}: {
  label: string
  busy: boolean
  busyReasonId: string
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="tap-target min-h-11"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${label}の操作`}
        aria-describedby={busy ? busyReasonId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        操作
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-40 rounded-md border border-border bg-surface p-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className="tap-target flex min-h-11 w-full items-center rounded px-3 text-left text-body text-danger disabled:cursor-not-allowed disabled:text-disabled disabled:opacity-60"
            disabled={busy}
            aria-disabled={busy || undefined}
            aria-describedby={busy ? busyReasonId : undefined}
            onClick={() => {
              if (busy) return
              setOpen(false)
              onDelete()
            }}
          >
            削除
          </button>
        </div>
      ) : null}
    </div>
  )
}
