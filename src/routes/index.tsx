import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { SourceModal } from '~/components/source-modal'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { ConfirmDialog } from '~/components/ui/confirm-dialog'
import { EmptyState } from '~/components/ui/empty-state'
import { ErrorRetry } from '~/components/ui/error-retry'
import { LoadingSkeleton, PendingMark } from '~/components/ui/loading-skeleton'
import { asyncListView } from '~/domain/async-view'
import { notebookDeleteConfirm } from '~/domain/destructive-confirm'
import {
  HOME_CATALOG_LOADING_LABEL,
  HOME_EMPTY_DESCRIPTION,
  HOME_EMPTY_TITLE,
  homeCreateCtaPlacement,
} from '~/domain/home'
import {
  notebookUpdatedAtLabel,
  type NotebookId,
  type OrganizationCatalog,
} from '~/domain/organization'
import { organizationKeys } from '~/lib/query-keys'
import { userFacingError } from '~/lib/utils'
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
          <ul className="space-y-stack">
            {list.items.map((notebook) => (
              <li key={notebook.id}>
                <NotebookCard
                  notebook={notebook}
                  deleting={deletingNotebookId === notebook.id}
                  onDelete={() => setPendingNotebook(notebook)}
                />
              </li>
            ))}
          </ul>
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
  deleting,
  onDelete,
}: {
  notebook: OrganizationCatalog['notebooks'][number]
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <Card className="p-0" aria-busy={deleting || undefined}>
      <div className="flex items-stretch">
        <Link
          to="/notebooks/$notebookId"
          params={{ notebookId: notebook.id }}
          className="min-w-0 flex-1 px-inset py-stack hover:bg-surface-muted active:bg-surface-muted"
        >
          <span className="font-medium text-ink">{notebook.title}</span>
          <p className="mt-1 text-meta text-muted">
            {notebook.sourceCount}件のソース · {notebookUpdatedAtLabel(notebook.updatedAt)}
          </p>
        </Link>
        <div className="flex shrink-0 items-start px-inset py-stack pl-0">
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
