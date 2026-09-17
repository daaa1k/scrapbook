import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { SourceModal } from '~/components/source-modal'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import {
  formatNotebookUpdatedAt,
  notebookDeleteConfirmMessage,
  type NotebookId,
  type OrganizationCatalog,
} from '~/domain/organization'
import { organizationKeys } from '~/lib/query-keys'
import { userFacingError } from '~/lib/utils'
import { deleteNotebook, getOrganizationCatalog } from '~/server/functions/organization'

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: organizationKeys.catalog,
      queryFn: () => getOrganizationCatalog(),
    }),
  component: HomePage,
})

function HomePage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const catalog = useQuery({
    queryKey: organizationKeys.catalog,
    queryFn: () => getOrganizationCatalog(),
  })

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

  const notebooks = catalog.data?.notebooks ?? []

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-2 text-2xl font-semibold">ノート</h1>
          <p className="text-sm text-zinc-500">ノートを開くか、新しく作成してください。</p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          新しいノート
        </Button>
      </section>
      {listError ? <p className="text-sm text-red-600">{listError}</p> : null}
      <section>
        {notebooks.length === 0 ? (
          <Card>
            <p className="mb-3">ノートはまだありません。</p>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              新しいノート
            </Button>
          </Card>
        ) : (
          <ul className="space-y-3">
            {notebooks.map((notebook) => (
              <li key={notebook.id}>
                <NotebookCard
                  notebook={notebook}
                  busy={removeNotebook.isPending}
                  onDelete={() => {
                    if (!window.confirm(notebookDeleteConfirmMessage(notebook.title))) return
                    removeNotebook.mutate(notebook.id)
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
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
  busy,
  onDelete,
}: {
  notebook: OrganizationCatalog['notebooks'][number]
  busy: boolean
  onDelete: () => void
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/notebooks/$notebookId"
            params={{ notebookId: notebook.id }}
            className="font-medium hover:underline"
          >
            {notebook.title}
          </Link>
          <p className="mt-1 text-sm text-zinc-500">{notebook.sourceCount}件のソース</p>
          <p className="mt-1 text-sm text-zinc-500">{formatNotebookUpdatedAt(notebook.updatedAt)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            to="/notebooks/$notebookId"
            params={{ notebookId: notebook.id }}
            className="text-sm text-zinc-700 hover:underline dark:text-zinc-300"
          >
            開く
          </Link>
          <Button type="button" disabled={busy} onClick={onDelete} aria-label={`${notebook.title}を削除`}>
            削除
          </Button>
        </div>
      </div>
    </Card>
  )
}
