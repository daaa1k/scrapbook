import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { SourceInvestigate } from '~/components/source-investigate'
import { SourceMemoPane } from '~/components/source-memo-pane'
import { SourceModal } from '~/components/source-modal'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { resolveNoteShellView, type NoteShellSearch } from '~/domain/note-shell'
import { sourceListFilterFromSourcesPageSearch } from '~/domain/organization'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { isTerminalJobStatus, userFacingError } from '~/lib/utils'
import { getOrganizationCatalog, runOrganizationCommand } from '~/server/functions/organization'
import { deleteRegisteredSource, listSources } from '~/server/functions/sources'

export function NoteShell({ notebookId, sourceId }: NoteShellSearch) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [paneError, setPaneError] = useState<string | null>(null)
  const [flushMemo, setFlushMemo] = useState<(() => Promise<void>) | null>(null)
  const [mobilePane, setMobilePane] = useState<'sources' | 'study' | 'memo'>('study')
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
      await flushMemo?.()
    } catch {
      // Keep the draft; surface error via memo pane state.
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
                  return (
                    <li key={source.id}>
                      <div
                        className={
                          focused
                            ? 'rounded-md border border-zinc-900 p-2 dark:border-zinc-100'
                            : 'rounded-md border border-transparent p-2 hover:border-zinc-200 dark:hover:border-zinc-700'
                        }
                      >
                        {source.url ? (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full truncate text-left text-sm underline"
                            aria-current={focused ? 'true' : undefined}
                            onClick={() => {
                              void focusSource(source.id)
                              setMobilePane('study')
                            }}
                          >
                            {source.title ?? source.url ?? source.id}
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="w-full truncate text-left text-sm"
                            aria-current={focused ? 'true' : undefined}
                            onClick={() => {
                              void focusSource(source.id)
                              setMobilePane('study')
                            }}
                          >
                            {source.title ?? source.url ?? source.id}
                          </button>
                        )}
                        <div className="mt-2 flex justify-end">
                          <Button
                            type="button"
                            className="text-xs"
                            disabled={busy || removeSource.isPending}
                            aria-label={`${source.title ?? source.id}を削除`}
                            onClick={() => {
                              if (busy) {
                                setPaneError('処理中のソースは削除できません')
                                return
                              }
                              const label = source.title ?? source.url ?? source.id
                              if (
                                !window.confirm(
                                  `「${label}」を削除しますか？関連する要約・質問・メモも削除されます。`,
                                )
                              ) {
                                return
                              }
                              removeSource.mutate(source.id)
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
                registerFlush={(flush) => setFlushMemo(() => flush)}
              />
            </aside>
          </div>
        </div>
      )}

      <SourceModal
        notebook={notebookId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSourceAdded={async ({ sourceId: addedSourceId }) => {
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
