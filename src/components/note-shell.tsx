import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { SourceInvestigate } from '~/components/source-investigate'
import { SourceModal } from '~/components/source-modal'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { resolveNoteShellView, type NoteShellSearch } from '~/domain/note-shell'
import { sourceListFilterFromSourcesPageSearch } from '~/domain/organization'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { getOrganizationCatalog } from '~/server/functions/organization'
import { listSources } from '~/server/functions/sources'

export function NoteShell({ notebookId, sourceId }: NoteShellSearch) {
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const filter = sourceListFilterFromSourcesPageSearch({ notebookId })

  const catalog = useQuery({
    queryKey: organizationKeys.catalog,
    queryFn: () => getOrganizationCatalog(),
  })

  const sourcesQuery = useQuery({
    queryKey: sourceKeys.list(filter),
    queryFn: () => listSources({ data: filter }),
  })

  async function focusSource(nextSourceId: string) {
    await navigate({
      to: '/sources',
      search: { notebookId, sourceId: nextSourceId },
    })
  }

  if (!catalog.data || sourcesQuery.data === undefined) {
    return <p>読み込み中…</p>
  }

  const view = resolveNoteShellView({ notebookId, sourceId }, catalog.data, sourcesQuery.data)

  if (view.status === 'unknown-notebook') {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm text-zinc-500 hover:underline">
          ← ホームへ
        </Link>
        <Card>
          <p>ノートブックが見つかりません。</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/" className="text-sm text-zinc-500 hover:underline">
            ← ホームへ
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">{view.notebook.title}</h1>
        </div>
        <Button type="button" onClick={() => setModalOpen(true)}>
          ソースを追加
        </Button>
      </div>

      {view.status === 'empty' ? (
        <Card>
          <p className="mb-3">まだソースがありません。追加すると要約と質問が使えます。</p>
          <Button type="button" onClick={() => setModalOpen(true)}>
            ソースを追加
          </Button>
        </Card>
      ) : (
        <>
          <section aria-label="ソース">
            <h2 className="mb-2 text-sm font-medium text-zinc-500">ソース</h2>
            <ul className="flex flex-wrap gap-2">
              {view.sources.map((source) => {
                const focused = source.id === view.focusSourceId
                return (
                  <li key={source.id}>
                    <div
                      className={
                        focused
                          ? 'flex items-center gap-2 rounded-md border border-zinc-900 px-3 py-2 text-sm dark:border-zinc-100'
                          : 'flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700'
                      }
                    >
                      <button
                        type="button"
                        className="max-w-[14rem] truncate text-left hover:underline"
                        aria-current={focused ? 'true' : undefined}
                        onClick={() => void focusSource(source.id)}
                      >
                        {source.title ?? source.url ?? source.id}
                      </button>
                      <Link
                        to="/sources/$sourceId"
                        params={{ sourceId: source.id }}
                        className="shrink-0 text-zinc-500 hover:underline"
                      >
                        詳細
                      </Link>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
          <SourceInvestigate key={view.focusSourceId} sourceId={view.focusSourceId} />
        </>
      )}

      <SourceModal
        notebookId={notebookId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSourceAdded={async (addedSourceId) => {
          setModalOpen(false)
          await navigate({
            to: '/sources',
            search: { notebookId, sourceId: addedSourceId },
          })
        }}
      />
    </div>
  )
}
