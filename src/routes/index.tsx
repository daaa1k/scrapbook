import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { SourceModal } from '~/components/source-modal'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { ConfirmDialog } from '~/components/ui/confirm-dialog'
import { EmptyState } from '~/components/ui/empty-state'
import { ErrorRetry } from '~/components/ui/error-retry'
import { Input } from '~/components/ui/input'
import { LoadingSkeleton, PendingMark } from '~/components/ui/loading-skeleton'
import { asyncListView } from '~/domain/async-view'
import { notebookDeleteConfirm } from '~/domain/destructive-confirm'
import {
  HOME_CATALOG_LOADING_LABEL,
  HOME_EMPTY_DESCRIPTION,
  HOME_EMPTY_TITLE,
  HOME_SEARCH_EMPTY_TITLE,
  homeCreateCtaPlacement,
  homeDensityLabel,
  presentHomeNotebooks,
  readStoredHomeDensity,
  writeStoredHomeDensity,
  type HomeDensity,
  type HomeNotebookSort,
} from '~/domain/home'
import {
  notebookUpdatedAtLabel,
  type NotebookId,
  type OrganizationCatalog,
} from '~/domain/organization'
import { organizationKeys } from '~/lib/query-keys'
import { cn, userFacingError } from '~/lib/utils'
import { deleteNotebook, getOrganizationCatalog } from '~/server/functions/organization'

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: organizationKeys.catalog,
        queryFn: () => getOrganizationCatalog(),
      })
    } catch {
      return
    }
  },
  component: HomePage,
})

function HomePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [pendingNotebook, setPendingNotebook] = useState<OrganizationCatalog['notebooks'][number] | null>(
    null,
  )
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<HomeNotebookSort>('updated')
  const [density, setDensity] = useState<HomeDensity>(() => readStoredHomeDensity())

  const catalog = useQuery({
    queryKey: organizationKeys.catalog,
    queryFn: () => getOrganizationCatalog(),
  })
  const list = asyncListView({
    data: catalog.data?.notebooks,
    isError: catalog.isError,
    isFetching: catalog.isFetching,
  })
  const createCta = homeCreateCtaPlacement(list)
  const visibleNotebooks = useMemo(
    () => (list.status === 'ready' ? presentHomeNotebooks(list.items, search, sort) : []),
    [list, search, sort],
  )

  const removeNotebook = useMutation({
    mutationFn: (notebookId: NotebookId) => deleteNotebook({ data: { notebookId } }),
    onSuccess: async () => {
      setListError(null)
      await queryClient.invalidateQueries({ queryKey: organizationKeys.catalog })
    },
    onError: (error) => {
      setListError(userFacingError(error))
    },
  })
  const deletingNotebookId = removeNotebook.isPending ? removeNotebook.variables : undefined

  function cycleDensity() {
    const next: HomeDensity = density === 'comfortable' ? 'compact' : 'comfortable'
    setDensity(next)
    writeStoredHomeDensity(next)
  }

  return (
    <div className="space-y-section">
      <div className="flex flex-wrap items-center justify-between gap-gap">
        <h1 className="text-heading font-semibold tracking-tight">ノート</h1>
        {createCta === 'header' ? (
          <Button type="button" onClick={() => setCreateOpen(true)}>
            新しいノート
          </Button>
        ) : null}
      </div>
      {listError ? <Alert id="home-list-error">{listError}</Alert> : null}
      <section aria-busy={catalog.isFetching || removeNotebook.isPending || undefined}>
        {list.status === 'loading' ? (
          <LoadingSkeleton label={HOME_CATALOG_LOADING_LABEL} lines={3} />
        ) : list.status === 'error' ? (
          <ErrorRetry id="home-catalog-error" onRetry={() => void catalog.refetch()}>
            {userFacingError(catalog.error)}
          </ErrorRetry>
        ) : list.status === 'empty' ? (
          <EmptyState
            title={HOME_EMPTY_TITLE}
            description={HOME_EMPTY_DESCRIPTION}
            action={
              createCta === 'empty' ? (
                <Button type="button" onClick={() => setCreateOpen(true)}>
                  新しいノート
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="space-y-stack" data-density={density}>
            <div className="flex flex-wrap items-end gap-gap">
              <div className="min-w-[12rem] flex-1">
                <label htmlFor="home-notebook-search" className="mb-1 block text-meta font-medium text-muted">
                  検索
                </label>
                <Input
                  id="home-notebook-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ノート名で検索"
                  autoComplete="off"
                />
              </div>
              <div>
                <label htmlFor="home-notebook-sort" className="mb-1 block text-meta font-medium text-muted">
                  並び替え
                </label>
                <select
                  id="home-notebook-sort"
                  className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-body text-ink"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as HomeNotebookSort)}
                >
                  <option value="updated">更新順</option>
                  <option value="name">名前順</option>
                </select>
              </div>
              <Button type="button" variant="secondary" onClick={cycleDensity} aria-pressed={density === 'compact'}>
                表示: {homeDensityLabel(density)}
              </Button>
            </div>
            {visibleNotebooks.length === 0 ? (
              <EmptyState title={HOME_SEARCH_EMPTY_TITLE} description="検索条件を変えてみてください。" />
            ) : (
              <ul className={cn(density === 'compact' ? 'space-y-2' : 'space-y-stack')}>
                {visibleNotebooks.map((notebook) => (
                  <li key={notebook.id}>
                    <NotebookCard
                      notebook={notebook}
                      density={density}
                      deleting={deletingNotebookId === notebook.id}
                      onDelete={() => setPendingNotebook(notebook)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      {pendingNotebook ? (
        <ConfirmDialog
          open
          {...notebookDeleteConfirm(pendingNotebook.title)}
          tone="danger"
          onCancel={() => setPendingNotebook(null)}
          onConfirm={() => {
            const notebookId = pendingNotebook.id
            setPendingNotebook(null)
            removeNotebook.mutate(notebookId)
          }}
        />
      ) : null}
      <SourceModal
        notebook="new"
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSourceAdded={async ({ sourceId, notebookId }) => {
          setCreateOpen(false)
          await navigate({
            to: '/notebooks/$notebookId',
            params: { notebookId },
            search: { sourceId },
          })
        }}
      />
    </div>
  )
}

function NotebookCard({
  notebook,
  density,
  deleting,
  onDelete,
}: {
  notebook: OrganizationCatalog['notebooks'][number]
  density: HomeDensity
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <Card className="p-0" aria-busy={deleting || undefined}>
      <div className="flex items-stretch">
        <Link
          to="/notebooks/$notebookId"
          params={{ notebookId: notebook.id }}
          className={cn(
            'min-w-0 flex-1 hover:bg-surface-muted active:bg-surface-muted',
            density === 'compact' ? 'px-2.5 py-2' : 'px-inset py-stack',
          )}
        >
          <span className="font-medium text-ink">{notebook.title}</span>
          <p className="mt-1 text-meta text-muted">
            {notebook.sourceCount}件のソース · {notebookUpdatedAtLabel(notebook.updatedAt)}
          </p>
        </Link>
        <div
          className={cn(
            'flex shrink-0 items-start pl-0',
            density === 'compact' ? 'px-2.5 py-2' : 'px-inset py-stack',
          )}
        >
          <Button
            type="button"
            variant="danger"
            disabled={deleting}
            onClick={onDelete}
            aria-label={`${notebook.title}を削除`}
          >
            {deleting ? (
              <span className="inline-flex items-center gap-2">
                <PendingMark />
                削除しています
              </span>
            ) : (
              '削除'
            )}
          </Button>
        </div>
      </div>
    </Card>
  )
}
