import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { SourceModal } from '~/components/source-modal'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import {
  type HomeCreateFlow,
  type OrganizationCatalog,
  notebookIdSchema,
} from '~/domain/organization'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { userFacingError } from '~/lib/utils'
import { getOrganizationCatalog, runOrganizationCommand } from '~/server/functions/organization'

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
  const [createTitle, setCreateTitle] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [createFlow, setCreateFlow] = useState<HomeCreateFlow>({ status: 'idle' })

  const catalog = useQuery({
    queryKey: organizationKeys.catalog,
    queryFn: () => getOrganizationCatalog(),
  })

  const run = useMutation({
    mutationFn: (data: Parameters<typeof runOrganizationCommand>[0]['data']) =>
      runOrganizationCommand({ data }),
    onSuccess: async (ack, variables) => {
      setFormError(null)
      const tasks = [queryClient.invalidateQueries({ queryKey: organizationKeys.catalog })]
      if (variables.type === 'rename-notebook') {
        tasks.push(queryClient.invalidateQueries({ queryKey: sourceKeys.all }))
      }
      await Promise.all(tasks)
      if (variables.type !== 'create-notebook') return
      setCreateTitle('')
      const notebookId = notebookIdSchema.safeParse(ack.notebookId)
      if (!notebookId.success) {
        setFormError('ノートブックの作成に失敗しました')
        return
      }
      setCreateFlow({ status: 'awaiting-source', notebookId: notebookId.data })
    },
    onError: (error) => {
      setFormError(userFacingError(error))
    },
  })

  const notebooks = catalog.data?.notebooks ?? []
  const modalOpen = createFlow.status === 'awaiting-source'
  const modalNotebookId = createFlow.status === 'awaiting-source' ? createFlow.notebookId : null

  return (
    <div className="space-y-8">
      <section>
        <h1 className="mb-2 text-2xl font-semibold">ノートブック</h1>
        <p className="mb-4 text-sm text-zinc-500">ノートブックを開くか、新しく作成してください。</p>
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault()
            setFormError(null)
            run.mutate({ type: 'create-notebook', title: createTitle })
          }}
        >
          <Input
            name="notebook-title"
            required
            maxLength={100}
            placeholder="新しいノートブック名"
            value={createTitle}
            onChange={(event) => setCreateTitle(event.target.value)}
            aria-label="ノートブック名"
            disabled={createFlow.status === 'awaiting-source'}
          />
          <Button type="submit" disabled={run.isPending || createFlow.status === 'awaiting-source'}>
            作成
          </Button>
        </form>
        {formError ? <p className="mt-2 text-sm text-red-600">{formError}</p> : null}
      </section>
      <section>
        {notebooks.length === 0 ? (
          <Card>
            <p>ノートブックはまだありません。上のフォームから作成してください。</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {notebooks.map((notebook) => (
              <li key={notebook.id}>
                <NotebookCard
                  notebook={notebook}
                  busy={run.isPending}
                  onRename={(title) =>
                    run.mutate({ type: 'rename-notebook', notebookId: notebook.id, title })
                  }
                  onDelete={() => run.mutate({ type: 'delete-notebook', notebookId: notebook.id })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      {modalNotebookId ? (
        <SourceModal
          notebookId={modalNotebookId}
          open={modalOpen}
          onClose={() => setCreateFlow({ status: 'idle' })}
          onSourceAdded={async () => {
            const notebookId = modalNotebookId
            setCreateFlow({ status: 'idle' })
            await navigate({ to: '/sources', search: { notebookId } })
          }}
        />
      ) : null}
    </div>
  )
}

function NotebookCard({
  notebook,
  busy,
  onRename,
  onDelete,
}: {
  notebook: OrganizationCatalog['notebooks'][number]
  busy: boolean
  onRename: (title: string) => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState<string>(notebook.title)
  useEffect(() => {
    setTitle(notebook.title)
  }, [notebook.title])

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/sources"
            search={{ notebookId: notebook.id }}
            className="font-medium hover:underline"
          >
            {notebook.title}
          </Link>
          <p className="mt-1 text-sm text-zinc-500">{notebook.sourceCount}件のソース</p>
        </div>
        <Link
          to="/sources"
          search={{ notebookId: notebook.id }}
          className="shrink-0 text-sm text-zinc-700 hover:underline dark:text-zinc-300"
        >
          開く
        </Link>
      </div>
      <form
        className="mt-3 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          onRename(title)
        }}
      >
        <Input
          name={`rename-${notebook.id}`}
          required
          maxLength={100}
          value={title}
          disabled={notebook.isInbox}
          onChange={(event) => setTitle(event.target.value)}
          aria-label={`${notebook.title}の名前`}
        />
        <Button type="submit" disabled={notebook.isInbox || busy}>
          名前を変更
        </Button>
        <Button
          type="button"
          disabled={notebook.isInbox || notebook.sourceCount > 0 || busy}
          onClick={onDelete}
        >
          削除
        </Button>
      </form>
    </Card>
  )
}
