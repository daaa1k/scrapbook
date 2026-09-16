import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Card } from '~/components/ui/card'
import { Input, controlClassName } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { pdfTextHelp, sourceOriginalPath } from '~/domain/pdf'
import { storedBodyText } from '~/domain/ingest-result'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import {
  acquiredViaLabel,
  fetchStatusLabel,
  isTerminalJobStatus,
  jobErrorReason,
  jobStatusLabel,
  sourceKindLabel,
  userFacingError,
} from '~/lib/utils'
import { getOrganizationCatalog, runOrganizationCommand } from '~/server/functions/organization'
import { getSource, pasteSource, retrySource, askSource, summarizeSource } from '~/server/functions/sources'

export const Route = createFileRoute('/sources/$sourceId')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: sourceKeys.detail(params.sourceId),
        queryFn: () => getSource({ data: { sourceId: params.sourceId } }),
      }),
      context.queryClient.ensureQueryData({
        queryKey: organizationKeys.catalog,
        queryFn: () => getOrganizationCatalog(),
      }),
    ]),
  component: SourceDetailPage,
})

function SourceDetailPage() {
  const { sourceId } = Route.useParams()
  const queryClient = useQueryClient()
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [questionDraft, setQuestionDraft] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [selectedNotebookId, setSelectedNotebookId] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [memoDraft, setMemoDraft] = useState('')

  const query = useQuery({
    queryKey: sourceKeys.detail(sourceId),
    queryFn: () => getSource({ data: { sourceId } }),
    refetchInterval: (current) => {
      const status = current.state.data?.job?.status
      if (!status || isTerminalJobStatus(status)) return false
      return 2000
    },
  })

  const catalog = useQuery({
    queryKey: organizationKeys.catalog,
    queryFn: () => getOrganizationCatalog(),
  })

  const source = query.data

  useEffect(() => {
    if (!source) return
    setSelectedNotebookId(source.organization.notebook.id)
    setMemoDraft(source.organization.memo ?? '')
  }, [source?.organization.notebook.id, source?.organization.memo])

  const retry = useMutation({
    mutationFn: () => retrySource({ data: { sourceId } }),
    onSuccess: async () => {
      setActionError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) }),
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      ])
    },
    onError: (error) => {
      setActionError(userFacingError(error))
    },
  })

  const summarize = useMutation({
    mutationFn: () => summarizeSource({ data: { sourceId } }),
    onSuccess: async () => {
      setActionError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) }),
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      ])
    },
    onError: (error) => {
      setActionError(userFacingError(error))
    },
  })

  const ask = useMutation({
    mutationFn: () => askSource({ data: { sourceId, question: questionDraft } }),
    onSuccess: async () => {
      setActionError(null)
      setQuestionDraft('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) }),
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      ])
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) }),
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      ])
    },
    onError: (error) => {
      setActionError(userFacingError(error))
    },
  })

  const organize = useMutation({
    mutationFn: (data: Parameters<typeof runOrganizationCommand>[0]['data']) =>
      runOrganizationCommand({ data }),
    onSuccess: async (_ack, variables) => {
      setActionError(null)
      if (variables.type === 'attach-tag' || variables.type === 'detach-tag') {
        setTagDraft('')
      }
      if (variables.type === 'set-memo') {
        await queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) })
        return
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) }),
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
        queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
      ])
    },
    onError: (error) => {
      setActionError(userFacingError(error))
    },
  })

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
      <Card>
        <h2 className="mb-3 font-medium">整理</h2>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            organize.mutate({ type: 'move-source', sourceId, notebookId: selectedNotebookId })
          }}
        >
          <label className="block min-w-0 flex-1">
            <span className="mb-1 block text-sm text-zinc-500">ノートブック</span>
            <select
              className={controlClassName}
              value={selectedNotebookId}
              onChange={(event) => setSelectedNotebookId(event.target.value)}
              aria-label="ノートブック"
            >
              {catalog.data?.notebooks.map((notebook) => (
                <option key={notebook.id} value={notebook.id}>
                  {notebook.title}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={organize.isPending}>
            移動する
          </Button>
        </form>
        <div className="mt-4">
          <p className="mb-2 text-sm text-zinc-500">タグ</p>
          {source.organization.tags.length === 0 ? (
            <p className="text-sm text-zinc-500">まだありません</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {source.organization.tags.map((tag) => (
                <li key={tag} className="flex items-center gap-2 rounded-md border border-zinc-200 px-2 py-1 text-sm dark:border-zinc-700">
                  <span>{tag}</span>
                  <Button
                    disabled={organize.isPending}
                    onClick={() => organize.mutate({ type: 'detach-tag', sourceId, tagName: tag })}
                  >
                    はずす
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="mt-3 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              organize.mutate({ type: 'attach-tag', sourceId, tagName: tagDraft })
            }}
          >
            <Input
              name="tag"
              list="organization-tags"
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              placeholder="タグ名"
              aria-label="タグ"
              maxLength={50}
            />
            <datalist id="organization-tags">
              {catalog.data?.tags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
            <Button type="submit" disabled={organize.isPending || tagDraft.trim() === ''}>
              付ける
            </Button>
          </form>
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">自分のメモ</h2>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            organize.mutate({ type: 'set-memo', sourceId, memo: memoDraft })
          }}
        >
          <Textarea
            name="memo"
            value={memoDraft}
            onChange={(event) => setMemoDraft(event.target.value)}
            aria-label="自分のメモ"
            maxLength={20_000}
          />
          <Button type="submit" disabled={organize.isPending}>
            メモを保存
          </Button>
        </form>
      </Card>
      {source.kind === 'pdf' && !source.job ? null : (
      <Card>
        <h2 className="mb-2 font-medium">処理状況</h2>
        <p>{jobStatusLabel(jobStatus, source.job?.kind ?? null)}</p>
        {failed ? (
          <p className="mt-2 text-sm text-red-600">
            {jobErrorReason(source.job?.errorCode ?? null, source.job?.errorMessage ?? null, source.job?.kind ?? 'fetch')}
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
        {storedBodyText(source.body) ? (
          <div className="mt-4">
            <Button
              disabled={retryBusy || summarize.isPending}
              onClick={() => summarize.mutate()}
            >
              {source.summary == null ? '要約する' : '再要約する'}
            </Button>
            {retryBusy ? (
              <p className="mt-2 text-sm text-zinc-500">処理中のため要約できません。</p>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                保存済みの本文を要約します。URLの再取得やPDFの再読み込みはしません。
              </p>
            )}
          </div>
        ) : null}
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">引用</h2>
        {source.citations.length === 0 ? (
          <p className="text-sm text-zinc-500">まだありません</p>
        ) : (
          <ul className="space-y-3">
            {source.citations.map((citation) => (
              <li key={citation.id}>
                <blockquote className="whitespace-pre-wrap">{citation.excerpt}</blockquote>
                {citation.bodySpan ? (
                  <a href="#source-body" className="mt-1 inline-block text-sm underline">
                    本文の該当箇所へ
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">質問</h2>
        {storedBodyText(source.body) ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              ask.mutate()
            }}
          >
            <Textarea
              name="question"
              required
              value={questionDraft}
              onChange={(event) => setQuestionDraft(event.target.value)}
              placeholder="このソースについて質問"
              aria-label="質問"
              maxLength={4000}
            />
            <Button type="submit" disabled={retryBusy || ask.isPending || questionDraft.trim() === ''}>
              質問する
            </Button>
            {retryBusy ? (
              <p className="text-sm text-zinc-500">処理中のため質問できません。</p>
            ) : (
              <p className="text-sm text-zinc-500">保存済みの本文だけを使って答えます。複数ソースはまだ選べません。</p>
            )}
          </form>
        ) : (
          <p className="text-sm text-zinc-500">本文があるときだけ質問できます。</p>
        )}
        {source.qaAnswers.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">まだ質問はありません</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {source.qaAnswers.map((turn) => (
              <li key={turn.id} className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                <p className="text-sm text-zinc-500">質問</p>
                <p className="whitespace-pre-wrap">{turn.question}</p>
                <p className="text-sm text-zinc-500">回答</p>
                <p className="whitespace-pre-wrap">{turn.answer ?? '回答待ち…'}</p>
                {turn.citations.length > 0 ? (
                  <ul className="space-y-2">
                    {turn.citations.map((citation) => (
                      <li key={citation.id}>
                        <blockquote className="whitespace-pre-wrap text-sm">{citation.excerpt}</blockquote>
                        {citation.bodySpan ? (
                          <a href="#source-body" className="mt-1 inline-block text-sm underline">
                            本文の該当箇所へ
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">本文</h2>
        {pdfTextHelp(source) ? (
          <p className="mb-2 text-sm text-red-600">{pdfTextHelp(source)}</p>
        ) : null}
        <p id="source-body" className="whitespace-pre-wrap">{source.body ?? 'まだありません'}</p>
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
