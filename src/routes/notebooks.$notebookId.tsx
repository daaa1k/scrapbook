import { createFileRoute, redirect } from '@tanstack/react-router'
import { NoteShell } from '~/components/note-shell'
import { resolveNoteShellView } from '~/domain/note-shell'
import {
  notebookIdSchema,
  parseNotebookPageSearch,
  sourceListFilterFromSourcesPageSearch,
} from '~/domain/organization'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { getOrganizationCatalog } from '~/server/functions/organization'
import { getSource, listSources } from '~/server/functions/sources'

export const Route = createFileRoute('/notebooks/$notebookId')({
  params: {
    parse: ({ notebookId }) => {
      const parsed = notebookIdSchema.safeParse(notebookId)
      if (!parsed.success) throw redirect({ to: '/' })
      return { notebookId: parsed.data }
    },
    stringify: ({ notebookId }) => ({ notebookId }),
  },
  validateSearch: parseNotebookPageSearch,
  loaderDeps: ({ search }) => ({ sourceId: search.sourceId }),
  loader: async ({ context, params, deps }) => {
    const filter = sourceListFilterFromSourcesPageSearch({ notebookId: params.notebookId })
    const [sources, catalog] = await Promise.all([
      context.queryClient
        .ensureQueryData({
          queryKey: sourceKeys.list(filter),
          queryFn: () => listSources({ data: filter }),
        })
        .catch(() => undefined),
      context.queryClient
        .ensureQueryData({
          queryKey: organizationKeys.catalog,
          queryFn: () => getOrganizationCatalog(),
        })
        .catch(() => undefined),
    ])
    if (!catalog || sources === undefined) return
    const view = resolveNoteShellView(
      { notebookId: params.notebookId, sourceId: deps.sourceId },
      catalog,
      sources,
    )
    if (view.status !== 'ready') return
    await context.queryClient
      .ensureQueryData({
        queryKey: sourceKeys.detail(view.focusSourceId),
        queryFn: () => getSource({ data: { sourceId: view.focusSourceId } }),
      })
      .catch(() => undefined)
  },
  component: NotebookPage,
})

function NotebookPage() {
  const { notebookId } = Route.useParams()
  const { sourceId } = Route.useSearch()
  return <NoteShell notebookId={notebookId} sourceId={sourceId} />
}
