import { createFileRoute, redirect } from '@tanstack/react-router'
import { NoteShell } from '~/components/note-shell'
import {
  notebookIdSchema,
  parseNotebookPageSearch,
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
    await Promise.all([
      context.queryClient
        .ensureQueryData({
          queryKey: organizationKeys.catalog,
          queryFn: () => getOrganizationCatalog(),
        })
        .catch(() => undefined),
      context.queryClient.prefetchInfiniteQuery({
        queryKey: sourceKeys.list({ q: '', notebookId: params.notebookId, tagName: null, sort: 'created' }),
        queryFn: ({ pageParam }) => listSources({ data: { q: '', notebookId: params.notebookId, tagName: null, sort: 'created', cursor: pageParam } }),
        initialPageParam: null as { key: string | number; id: string } | null,
        getNextPageParam: (last: { nextCursor: { key: string | number; id: string } | null }) => last.nextCursor,
      }),
    ])
    if (!deps.sourceId) return
    await context.queryClient
      .ensureQueryData({
        queryKey: sourceKeys.detail(deps.sourceId),
        queryFn: () => getSource({ data: { sourceId: deps.sourceId! } }),
      })
      .catch(() => undefined)
  },
  component: NotebookPage,
})

function NotebookPage() {
  const { notebookId } = Route.useParams()
  const { sourceId } = Route.useSearch()
  return <NoteShell key={notebookId} notebookId={notebookId} sourceId={sourceId} />
}
