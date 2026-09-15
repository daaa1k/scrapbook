import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Card } from '~/components/ui/card'
import { isTerminalJobStatus, jobStatusLabel } from '~/lib/utils'
import { getSource } from '~/server/functions/sources'

export const Route = createFileRoute('/sources/$sourceId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ['source', params.sourceId],
      queryFn: () => getSource({ data: { sourceId: params.sourceId } }),
    }),
  component: SourceDetailPage,
})

function SourceDetailPage() {
  const { sourceId } = Route.useParams()
  const query = useQuery({
    queryKey: ['source', sourceId],
    queryFn: () => getSource({ data: { sourceId } }),
    refetchInterval: (current) => {
      const status = current.state.data?.job?.status
      if (!status || isTerminalJobStatus(status)) return false
      return 2000
    },
  })

  const source = query.data
  if (!source) {
    return <p>読み込み中…</p>
  }

  const failed = source.job?.status === 'failed'

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-zinc-500 hover:underline">
        ← ソース一覧
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{source.title ?? '無題のソース'}</h1>
        <p className="mt-1 text-sm text-zinc-500">{source.url}</p>
        <p className="mt-1 text-sm">
          種類: {source.kind} / 取得: {source.fetchStatus}
        </p>
      </div>
      <Card>
        <h2 className="mb-2 font-medium">処理状況</h2>
        <p>{jobStatusLabel(source.job?.status ?? null)}</p>
        {failed ? (
          <p className="mt-2 text-sm text-red-600">
            失敗しました
            {source.job?.errorCode ? ` (${source.job.errorCode})` : ''}
            {source.job?.errorMessage ? `: ${source.job.errorMessage}` : ''}
          </p>
        ) : null}
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">要約</h2>
        <p className="whitespace-pre-wrap">{source.summary ?? 'まだありません'}</p>
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">本文</h2>
        <p className="whitespace-pre-wrap">{source.body ?? 'まだありません'}</p>
      </Card>
    </div>
  )
}
