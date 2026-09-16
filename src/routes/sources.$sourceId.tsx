import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { pdfTextHelp, sourceOriginalPath } from '~/domain/pdf'
import {
  acquiredViaLabel,
  fetchStatusLabel,
  isTerminalJobStatus,
  jobErrorReason,
  jobStatusLabel,
  sourceKindLabel,
  userFacingError,
} from '~/lib/utils'
import { getSource, pasteSource, retrySource } from '~/server/functions/sources'

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
  const queryClient = useQueryClient()
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: ['source', sourceId],
    queryFn: () => getSource({ data: { sourceId } }),
    refetchInterval: (current) => {
      const status = current.state.data?.job?.status
      if (!status || isTerminalJobStatus(status)) return false
      return 2000
    },
  })

  const retry = useMutation({
    mutationFn: () => retrySource({ data: { sourceId } }),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: ['source', sourceId] })
      await queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (error) => {
      setActionError(userFacingError(error))
    },
  })

  const paste = useMutation({
    mutationFn: () =>
      pasteSource({
        data: {
          sourceId,
          title: pasteTitle,
          body: pasteBody,
        },
      }),
    onSuccess: async () => {
      setActionError(null)
      setPasteTitle('')
      setPasteBody('')
      await queryClient.invalidateQueries({ queryKey: ['source', sourceId] })
      await queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
    onError: (error) => {
      setActionError(userFacingError(error))
    },
  })

  const source = query.data
  if (!source) {
    return <p>読み込み中…</p>
  }

  const failed = source.job?.status === 'failed'
  const jobStatus = source.job?.status ?? null
  const canRetry = Boolean(source.url) && (jobStatus === null || isTerminalJobStatus(jobStatus))
  const retryBusy = Boolean(jobStatus && !isTerminalJobStatus(jobStatus))

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-zinc-500 hover:underline">
        ← ソース一覧
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{source.title ?? '無題のソース'}</h1>
        <p className="mt-1 text-sm text-zinc-500">{source.url}</p>
        <p className="mt-1 text-sm">
          種類: {sourceKindLabel(source.kind)} / 取得: {fetchStatusLabel(source.fetchStatus)} / 取得経路:{' '}
          {acquiredViaLabel(source.acquiredVia)}
        </p>
        {source.kind === 'pdf' ? (
          <p className="mt-3 text-sm">
            <a
              href={sourceOriginalPath(source.id)}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              PDFを開く
            </a>
            {' · '}
            <a href={`${sourceOriginalPath(source.id)}?download=1`} className="underline">
              ダウンロード
            </a>
          </p>
        ) : null}
      </div>
      {source.kind === 'pdf' ? null : (
      <Card>
        <h2 className="mb-2 font-medium">処理状況</h2>
        <p>{jobStatusLabel(jobStatus)}</p>
        {failed ? (
          <p className="mt-2 text-sm text-red-600">
            {jobErrorReason(source.job?.errorCode ?? null, source.job?.errorMessage ?? null)}
          </p>
        ) : null}
        {source.url ? (
          <div className="mt-4">
            <Button
              disabled={!canRetry || retry.isPending}
              onClick={() => retry.mutate()}
            >
              再取得する
            </Button>
            {retryBusy ? (
              <p className="mt-2 text-sm text-zinc-500">処理中のため再取得できません。</p>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                閲覧では Cursor を起動しません。再取得は新しいジョブを作ります。
              </p>
            )}
          </div>
        ) : null}
      </Card>
      )}
      <Card>
        <h2 className="mb-2 font-medium">要約</h2>
        <p className="whitespace-pre-wrap">{source.summary ?? 'まだありません'}</p>
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">本文</h2>
        {pdfTextHelp(source) ? (
          <p className="mb-2 text-sm text-red-600">{pdfTextHelp(source)}</p>
        ) : null}
        <p className="whitespace-pre-wrap">{source.body ?? 'まだありません'}</p>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">本文を手動で貼り付け</h2>
        <p className="mb-3 text-sm text-zinc-500">
          取得の代わりにタイトルと本文を保存します。Cursor は起動しません。要約は空のままです。
        </p>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            paste.mutate()
          }}
        >
          <Input
            name="paste-title"
            required
            placeholder="タイトル"
            value={pasteTitle}
            onChange={(event) => setPasteTitle(event.target.value)}
            aria-label="タイトル"
          />
          <Textarea
            name="paste-body"
            required
            placeholder="本文"
            value={pasteBody}
            onChange={(event) => setPasteBody(event.target.value)}
            aria-label="本文"
          />
          <Button type="submit" disabled={paste.isPending || retryBusy}>
            本文を保存
          </Button>
        </form>
      </Card>
      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
    </div>
  )
}
