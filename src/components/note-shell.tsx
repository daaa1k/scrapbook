import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SourceInvestigate } from '~/components/source-investigate'
import { SourceMemoPane } from '~/components/source-memo-pane'
import { SourceModal } from '~/components/source-modal'
import { Button } from '~/components/ui/button'
import { ConfirmDialog } from '~/components/ui/confirm-dialog'
import { Input } from '~/components/ui/input'
import { sourceDeleteConfirm } from '~/domain/destructive-confirm'
import { isLeavingNotebook, type MemoSessionHandle } from '~/domain/memo-save'
import { resolveNoteShellView, type NoteShellSearch } from '~/domain/note-shell'
import { sourceListFilterFromSourcesPageSearch } from '~/domain/organization'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { isTerminalJobStatus, userFacingError } from '~/lib/utils'
import { getOrganizationCatalog, runOrganizationCommand } from '~/server/functions/organization'
import { deleteRegisteredSource, listSources } from '~/server/functions/sources'

function notebookIdFromParams(params: object): string | undefined {
  if (!('notebookId' in params)) return undefined
  const id = params.notebookId
  return typeof id === 'string' ? id : undefined
}

export function NoteShell({ notebookId, sourceId }: NoteShellSearch) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [paneError, setPaneError] = useState<string | null>(null)
  const memoSessionRef = useRef<MemoSessionHandle | null>(null)
  const registerMemoSession = useCallback((session: MemoSessionHandle) => {
    memoSessionRef.current = session
  }, [])
  const [mobilePane, setMobilePane] = useState<'sources' | 'study' | 'memo'>('study')
  const [pendingSource, setPendingSource] = useState<{ id: string; label: string } | null>(null)

  const shouldBlockLeave = useCallback(async (args: { current: { params: object }; next: { params: object } }) => {
    if (!isLeavingNotebook(notebookIdFromParams(args.current.params), notebookIdFromParams(args.next.params))) {
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

  const filter = sourceListFilterFromSourcesPageSearch({ notebookId })

  const catalog = useQuery({
    queryKey: organizationKeys.catalog,
    queryFn: () => getOrganizationCatalog(),
  })

  const sourcesQuery = useQuery({
    queryKey: sourceKeys.list(filter),
    queryFn: () => listSources({ data: filter }),
  })

  const view =
    catalog.data && sourcesQuery.data !== undefined
      ? resolveNoteShellView({ notebookId, sourceId }, catalog.data, sourcesQuery.data)
      : null
  const notebookTitle = view && view.status !== 'unknown-notebook' ? view.notebook.title : null

  useEffect(() => {
    if (notebookTitle) setTitleDraft(notebookTitle)
  }, [notebookTitle])

  const rename = useMutation({
    mutationFn: (title: string) =>
      runOrganizationCommand({ data: { type: 'rename-notebook', notebookId, title } }),
    onSuccess: async () => {
      setRenameError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      ])
    },
    onError: (error) => setRenameError(userFacingError(error)),
  })

  const removeSource = useMutation({
    mutationFn: (id: string) => deleteRegisteredSource({ data: { sourceId: id } }),
    onSuccess: async (_result, deletedId) => {
      setPaneError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
      ])
      const remaining =
        view && view.status === 'ready'
          ? view.sources.filter((row) => row.id !== deletedId)
          : []
      const nextId = remaining[0]?.id
      await navigate({
        to: '/notebooks/$notebookId',
        params: { notebookId },
        search: nextId ? { sourceId: nextId } : {},
      })
    },
    onError: (error) => setPaneError(userFacingError(error)),
  })

  async function focusSource(nextSourceId: string) {
    if (view?.status === 'ready' && view.focusSourceId === nextSourceId) return
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
  }

  if (!view) {
    return <p>読み込み中…</p>
  }

  if (view.status === 'unknown-notebook') {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm text-zinc-500 hover:underline">
          ← ホームへ
        </Link>
        <p>ノートが見つかりません。</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <header className="shrink-0 space-y-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <Link to="/" className="text-sm text-zinc-500 hover:underline">
          ← ホームへ
        </Link>
        {blocker.status === 'blocked' ? (
          <div
            role="alertdialog"
            aria-labelledby="memo-leave-title"
            aria-describedby="memo-leave-desc"
            className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40"
          >
            <p id="memo-leave-title" className="font-medium text-red-800 dark:text-red-200">
              メモを保存できませんでした
            </p>
            <p id="memo-leave-desc">再試行するか、変更を破棄して移動できます。</p>
            <div className="flex gap-3">
              <button type="button" className="underline" onClick={() => void retryLeave()}>
                再試行
              </button>
              <button type="button" className="underline" onClick={discardAndLeave}>
                破棄
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <form
            className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              rename.mutate(titleDraft)
            }}
          >
            <Input
              name="notebook-title"
              required
              maxLength={100}
              value={titleDraft}
              disabled={rename.isPending}
              onChange={(event) => setTitleDraft(event.target.value)}
              aria-label="ノート名"
            />
            <Button type="submit" disabled={rename.isPending || titleDraft === view.notebook.title}>
              名前を変更
            </Button>
          </form>
          <Button type="button" onClick={() => setModalOpen(true)}>
            ソースを追加
          </Button>
        </div>
        {renameError ? <p className="text-sm text-red-600">{renameError}</p> : null}
        {paneError ? <p className="text-sm text-red-600">{paneError}</p> : null}
      </header>

      {view.status === 'empty' ? (
        <div className="rounded-md border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
          <p className="mb-3">まだソースがありません。追加すると要約と質問が使えます。</p>
          <Button type="button" onClick={() => setModalOpen(true)}>
            ソースを追加
          </Button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div
            className="flex gap-2 lg:hidden"
            role="tablist"
            aria-label="ノートの表示切替"
          >
            {(
              [
                { id: 'sources', label: 'ソース' },
                { id: 'study', label: '要約・質問' },
                { id: 'memo', label: 'メモ' },
              ] as const
            ).map((tab) => {
              const selected = mobilePane === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  id={`notebook-tab-${tab.id}`}
                  aria-controls={`notebook-panel-${tab.id}`}
                  className={
                    selected
                      ? 'rounded-md border border-zinc-900 px-3 py-1.5 text-sm dark:border-zinc-100'
                      : 'rounded-md border border-zinc-200 px-3 py-1.5 text-sm dark:border-zinc-700'
                  }
                  onClick={() => setMobilePane(tab.id)}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
            <aside
              id="notebook-panel-sources"
              role="tabpanel"
              aria-labelledby="notebook-tab-sources"
              className={`min-h-0 overflow-y-auto border-zinc-200 pr-0 dark:border-zinc-800 lg:block lg:border-r lg:pr-3 ${
                mobilePane === 'sources' ? 'block' : 'hidden'
              }`}
              aria-label="ソース一覧"
            >
              <h2 className="mb-3 text-sm font-medium text-zinc-500">ソース</h2>
              <ul className="space-y-2">
                {view.sources.map((source) => {
                  const focused = source.id === view.focusSourceId
                  const busy = Boolean(source.jobStatus && !isTerminalJobStatus(source.jobStatus))
                  const label = source.title ?? source.url ?? source.id
                  return (
                    <li key={source.id}>
                      <div
                        className={
                          focused
                            ? 'rounded-md border border-zinc-900 p-2 dark:border-zinc-100'
                            : 'rounded-md border border-transparent p-2 hover:border-zinc-200 dark:hover:border-zinc-700'
                        }
                      >
                        <div className="flex min-w-0 items-start gap-1">
                          <button
                            type="button"
                            className="min-w-0 flex-1 truncate text-left text-sm"
                            aria-current={focused ? 'true' : undefined}
                            onClick={() => {
                              void focusSource(source.id)
                              setMobilePane('study')
                            }}
                          >
                            {label}
                          </button>
                          {source.url ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex shrink-0 rounded-md p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
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
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={busy || removeSource.isPending}
                            aria-label={`${source.title ?? source.id}を削除`}
                            onClick={() => {
                              if (busy) {
                                setPaneError('処理中のソースは削除できません')
                                return
                              }
                              setPendingSource({ id: source.id, label })
                            }}
                          >
                            削除
                          </Button>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </aside>

            <main
              id="notebook-panel-study"
              role="tabpanel"
              aria-labelledby="notebook-tab-study"
              className={`min-h-0 overflow-y-auto lg:block ${mobilePane === 'study' ? 'block' : 'hidden'}`}
              aria-label="要約と質問"
            >
              <SourceInvestigate key={view.focusSourceId} sourceId={view.focusSourceId} />
            </main>

            <aside
              id="notebook-panel-memo"
              role="tabpanel"
              aria-labelledby="notebook-tab-memo"
              className={`min-h-0 overflow-y-auto border-zinc-200 pl-0 dark:border-zinc-800 lg:block lg:border-l lg:pl-3 ${
                mobilePane === 'memo' ? 'block' : 'hidden'
              }`}
              aria-label="メモ"
            >
              <SourceMemoPane
                key={view.focusSourceId}
                sourceId={view.focusSourceId}
                registerMemoSession={registerMemoSession}
              />
            </aside>
          </div>
        </div>
      )}

      {pendingSource ? (
        <ConfirmDialog
          open
          {...sourceDeleteConfirm(pendingSource.label)}
          tone="danger"
          onCancel={() => setPendingSource(null)}
          onConfirm={() => {
            const sourceIdToDelete = pendingSource.id
            setPendingSource(null)
            removeSource.mutate(sourceIdToDelete)
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
            return
          }
          setModalOpen(false)
          await navigate({
            to: '/notebooks/$notebookId',
            params: { notebookId },
            search: { sourceId: addedSourceId },
          })
        }}
      />
    </div>
  )
}
