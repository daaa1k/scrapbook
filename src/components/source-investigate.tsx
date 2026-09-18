import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CitedProse } from '~/components/citation-footnotes'
import { Button } from '~/components/ui/button'
import { Textarea } from '~/components/ui/textarea'
import { MAX_CURSOR_BODY_CHARS, storedBodyText } from '~/domain/ingest-result'
import { sourceKeys } from '~/lib/query-keys'
import { isTerminalJobStatus, jobStatusLabel, userFacingError } from '~/lib/utils'
import { askSource, deleteSourceQaAnswer, getSource, summarizeSource } from '~/server/functions/sources'

type SourceInvestigateProps = {
  sourceId: string
}

export function SourceInvestigate({ sourceId }: SourceInvestigateProps) {
  const queryClient = useQueryClient()
  const [questionDraft, setQuestionDraft] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useQuery({
    queryKey: sourceKeys.detail(sourceId),
    queryFn: () => getSource({ data: { sourceId } }),
    refetchInterval: (current) => {
      const status = current.state.data?.job?.status
      if (!status || isTerminalJobStatus(status)) return false
      return 2000
    },
  })

  const source = query.data

  const summarize = useMutation({
    mutationFn: () => summarizeSource({ data: { sourceId } }),
    onSuccess: async () => {
      setActionError(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) }),
        queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      ])
    },
    onError: (error) => setActionError(userFacingError(error)),
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
    onError: (error) => setActionError(userFacingError(error)),
  })

  const deleteQa = useMutation({
    mutationFn: (qaAnswerId: string) => deleteSourceQaAnswer({ data: { sourceId, qaAnswerId } }),
    onSuccess: async () => {
      setActionError(null)
      await queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) })
    },
    onError: (error) => setActionError(userFacingError(error)),
  })

  if (!source) {
    return <p className="text-sm text-zinc-500">読み込み中…</p>
  }

  const jobStatus = source.job?.status ?? null
  const jobKind = source.job?.kind ?? null
  const retryBusy = Boolean(jobStatus && !isTerminalJobStatus(jobStatus))
  const bodyForCursor = storedBodyText(source.body)
  const cursorBodyTruncated = Boolean(bodyForCursor && bodyForCursor.length > MAX_CURSOR_BODY_CHARS)
  const cursorBudgetNote = cursorBodyTruncated
    ? `Cursor には本文の先頭 ${MAX_CURSOR_BODY_CHARS.toLocaleString('ja-JP')} 文字だけを渡します。`
    : null
  const title = source.title ?? source.url ?? source.id

  return (
    <div className="flex min-h-0 flex-col gap-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">
          {source.url ? (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-500"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </h2>
        <p className="text-sm text-zinc-500">
          {jobStatus ? jobStatusLabel(jobStatus, jobKind) : '未処理'}
          {' · '}
          回答対象はこのソースのみ
        </p>
      </header>

      <section className="space-y-3" aria-label="要約">
        <h3 className="text-sm font-medium text-zinc-500">要約</h3>
        <CitedProse
          text={source.summary ?? ''}
          citations={source.citations}
          emptyLabel="まだありません"
        />
        {source.summary && source.citations.length > 0 ? (
          <p className="text-xs text-zinc-500">番号にマウスを置くと、本文からの引用が表示されます。</p>
        ) : null}
        {bodyForCursor ? (
          <div>
            <Button disabled={retryBusy || summarize.isPending} onClick={() => summarize.mutate()}>
              {source.summary == null ? '要約する' : '再要約する'}
            </Button>
            {retryBusy ? (
              <p className="mt-2 text-sm text-zinc-500">処理中のため要約できません。</p>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">
                保存済みの本文を要約します。URLの再取得やPDFの再読み込みはしません。
              </p>
            )}
            {cursorBudgetNote ? <p className="mt-2 text-sm text-zinc-500">{cursorBudgetNote}</p> : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3" aria-label="質問">
        <h3 className="text-sm font-medium text-zinc-500">質問</h3>
        {bodyForCursor ? (
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
              <p className="text-sm text-zinc-500">
                保存済みの本文だけを使って答えます。複数ソースはまだ選べません。
              </p>
            )}
            {cursorBudgetNote ? <p className="text-sm text-zinc-500">{cursorBudgetNote}</p> : null}
          </form>
        ) : (
          <p className="text-sm text-zinc-500">本文があるときだけ質問できます。</p>
        )}
        {source.qaAnswers.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">まだ質問はありません</p>
        ) : (
          <ul className="mt-2 space-y-4">
            {source.qaAnswers.map((turn) => (
              <li key={turn.id} className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm text-zinc-500">質問</p>
                    <p className="whitespace-pre-wrap">{turn.question}</p>
                  </div>
                  <Button
                    disabled={!turn.canDelete || deleteQa.isPending}
                    onClick={() => deleteQa.mutate(turn.id)}
                  >
                    削除
                  </Button>
                </div>
                <p className="text-sm text-zinc-500">回答</p>
                <CitedProse
                  text={turn.answer ?? ''}
                  citations={turn.citations}
                  emptyLabel="回答待ち…"
                />
                {!turn.canDelete ? (
                  <p className="text-sm text-zinc-500">処理中のため削除できません。</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
    </div>
  )
}
