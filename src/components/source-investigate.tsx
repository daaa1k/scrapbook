import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { CitedProse } from '~/components/citation-footnotes'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { ConfirmDialog } from '~/components/ui/confirm-dialog'
import { ErrorRetry } from '~/components/ui/error-retry'
import { Input } from '~/components/ui/input'
import { LoadingSkeleton } from '~/components/ui/loading-skeleton'
import { Textarea } from '~/components/ui/textarea'
import { qaDeleteConfirm } from '~/domain/destructive-confirm'
import { MAX_CURSOR_BODY_CHARS, storedBodyText } from '~/domain/ingest-result'
import {
  ASK_SCOPE_DETAIL,
  STUDY_SCOPE_SHORT,
  SUMMARIZE_SCOPE_DETAIL,
  cursorBodyBudgetCopy,
  jobCompletionAnnouncement,
  jobCopyInputFromSource,
  jobProgressView,
  jobStatusAlertText,
  qaTurnView,
  studyScopeLabel,
  type JobCopyInput,
  type JobRecoveryAction,
  type JobStatusView,
} from '~/domain/job-status-copy'
import type { JobStatus } from '~/domain/jobs'
import {
  sourceAddPasteBodyCount,
  sourceAddPasteBodyIssue,
  sourceAddPasteTitleIssue,
} from '~/domain/source-add'
import { STUDY_LOADING_LABEL } from '~/domain/note-shell'
import { sourceKeys } from '~/lib/query-keys'
import { isTerminalJobStatus, userFacingError } from '~/lib/utils'
import {
  askSource,
  deleteSourceQaAnswer,
  getSource,
  pasteSource,
  retrySource,
  summarizeSource,
} from '~/server/functions/sources'

type SourceInvestigateProps = {
  sourceId: string
}

function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const next = ids.filter((id): id is string => Boolean(id))
  return next.length > 0 ? next.join(' ') : undefined
}

function PendingMark() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      aria-hidden="true"
    />
  )
}

function ProgressLine({ view }: { view: JobStatusView }) {
  return (
    <p className="flex items-center gap-2 text-sm text-zinc-500">
      {view.pending ? <PendingMark /> : null}
      <span>{view.label}</span>
    </p>
  )
}

export function SourceInvestigate({ sourceId }: SourceInvestigateProps) {
  const queryClient = useQueryClient()
  const [questionDraft, setQuestionDraft] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [pasteTitleError, setPasteTitleError] = useState<string | null>(null)
  const [pasteBodyError, setPasteBodyError] = useState<string | null>(null)
  const [pasteRequested, setPasteRequested] = useState(false)
  const [completionAnnouncement, setCompletionAnnouncement] = useState('')
  const [pendingQa, setPendingQa] = useState<{ id: string; question: string } | null>(null)
  const previousJobStatus = useRef<JobStatus | null | undefined>(undefined)
  const pasteTitleSeeded = useRef(false)

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
  const jobInput: JobCopyInput | null = source ? jobCopyInputFromSource(source) : null
  const progress = jobInput ? jobProgressView(jobInput) : null

  useEffect(() => {
    if (!source || pasteTitleSeeded.current) return
    if (source.title?.trim()) {
      setPasteTitle(source.title)
      pasteTitleSeeded.current = true
    }
  }, [source])

  useEffect(() => {
    const nextStatus = source?.job?.status ?? null
    const nextKind = source?.job?.kind ?? null
    if (previousJobStatus.current === undefined) {
      previousJobStatus.current = nextStatus
      return
    }
    const text = jobCompletionAnnouncement(previousJobStatus.current, {
      status: nextStatus,
      kind: nextKind,
    })
    if (text) setCompletionAnnouncement(text)
    previousJobStatus.current = nextStatus
  }, [source?.job?.status, source?.job?.kind])

  const invalidateSource = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) }),
      queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
    ])
  }

  const summarize = useMutation({
    mutationFn: () => summarizeSource({ data: { sourceId } }),
    onSuccess: async () => {
      setActionError(null)
      await invalidateSource()
    },
    onError: (error) => setActionError(userFacingError(error)),
  })

  const ask = useMutation({
    mutationFn: (question: string) => askSource({ data: { sourceId, question } }),
    onSuccess: async (_result, question) => {
      setActionError(null)
      setQuestionDraft((current) => (current === question ? '' : current))
      await invalidateSource()
    },
    onError: (error) => setActionError(userFacingError(error)),
  })

  const retry = useMutation({
    mutationFn: () => retrySource({ data: { sourceId } }),
    onSuccess: async () => {
      setActionError(null)
      await invalidateSource()
    },
    onError: (error) => setActionError(userFacingError(error)),
  })

  const paste = useMutation({
    mutationFn: (input: { title: string; body: string }) =>
      pasteSource({ data: { sourceId, title: input.title, body: input.body } }),
    onSuccess: async () => {
      setActionError(null)
      setPasteBody('')
      setPasteRequested(false)
      setPasteTitleError(null)
      setPasteBodyError(null)
      await invalidateSource()
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

  if (query.isError && !source) {
    return (
      <ErrorRetry onRetry={() => void query.refetch()}>
        {userFacingError(query.error)}
      </ErrorRetry>
    )
  }

  if (!source || !jobInput || !progress) {
    return <LoadingSkeleton label={STUDY_LOADING_LABEL} lines={4} />
  }

  const jobKind = source.job?.kind ?? null
  const jobPending = progress.pending
  const bodyForCursor = storedBodyText(source.body)
  const budget = cursorBodyBudgetCopy(
    Boolean(bodyForCursor && bodyForCursor.length > MAX_CURSOR_BODY_CHARS),
  )
  const title = source.title ?? source.url ?? source.id
  const showPasteForm = pasteRequested || (!jobInput.hasBody && !jobPending)
  const pasteCount = sourceAddPasteBodyCount(pasteBody)
  const studyBusy =
    summarize.isPending || ask.isPending || retry.isPending || paste.isPending || jobPending
  const deletingQaId = deleteQa.isPending ? deleteQa.variables : undefined
  const recoveryActions = (progress.recovery ?? []).filter(
    (action) => action.id !== 'paste-body' || !showPasteForm,
  )
  const showJobRecoveryCard =
    (progress.tone === 'failure' && jobKind !== 'ask_source') ||
    (!jobInput.hasBody && !jobPending && progress.tone !== 'failure')

  function runRecovery(action: JobRecoveryAction, question?: string) {
    if (action.id === 'paste-body') {
      setPasteRequested(true)
      return
    }
    if (jobKind === 'fetch') {
      retry.mutate()
      return
    }
    if (jobKind === 'summarize_body') {
      summarize.mutate()
      return
    }
    const retryQuestion = question ?? source?.qaAnswers.find((turn) => turn.answer == null)?.question
    if (retryQuestion) ask.mutate(retryQuestion)
  }

  function submitPaste() {
    const titleIssue = sourceAddPasteTitleIssue(pasteTitle)
    const bodyIssue = sourceAddPasteBodyIssue(pasteBody)
    if (titleIssue || bodyIssue || pasteCount.over) {
      setPasteTitleError(titleIssue)
      setPasteBodyError(bodyIssue ?? (pasteCount.over ? sourceAddPasteBodyIssue(pasteBody) : null))
      return
    }
    setPasteTitleError(null)
    setPasteBodyError(null)
    paste.mutate({ title: pasteTitle, body: pasteBody })
  }

  return (
    <div className="flex min-h-0 flex-col gap-6" aria-busy={studyBusy || undefined}>
      <header className="space-y-2">
        <p className="text-lg font-semibold">
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
        </p>
        <p className="text-sm text-zinc-500">{studyScopeLabel(title)}</p>
        {progress.tone === 'pending' ? <ProgressLine view={progress} /> : null}
        <p id="investigate-job-complete" className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {completionAnnouncement}
        </p>
      </header>

      {showJobRecoveryCard ? (
        <div className="space-y-3">
          <Alert id="investigate-job-error">{jobStatusAlertText(progress)}</Alert>
          {recoveryActions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recoveryActions.map((action) => (
                <Button
                  key={action.id}
                  className="gap-2"
                  variant={action.id === 'retry' ? 'primary' : 'secondary'}
                  disabled={studyBusy}
                  onClick={() => runRecovery(action)}
                >
                  {retry.isPending && action.id === 'retry' ? <PendingMark /> : null}
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {showPasteForm ? (
        <form
          className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-700"
          aria-label="本文の貼り付け"
          onSubmit={(event) => {
            event.preventDefault()
            submitPaste()
          }}
        >
          <h3 className="text-sm font-medium text-zinc-500">本文を貼り付ける</h3>
          <div>
            <label htmlFor="investigate-paste-title" className="mb-1 block text-sm font-medium">
              タイトル
            </label>
            <Input
              id="investigate-paste-title"
              name="investigate-paste-title"
              value={pasteTitle}
              onChange={(event) => {
                setPasteTitle(event.target.value)
                if (pasteTitleError) setPasteTitleError(null)
              }}
              aria-invalid={pasteTitleError ? true : undefined}
              aria-describedby={describedBy(pasteTitleError && 'investigate-paste-title-error')}
            />
            {pasteTitleError ? (
              <Alert id="investigate-paste-title-error" className="mt-2">
                {pasteTitleError}
              </Alert>
            ) : null}
          </div>
          <div>
            <label htmlFor="investigate-paste-body" className="mb-1 block text-sm font-medium">
              本文
            </label>
            <Textarea
              id="investigate-paste-body"
              name="investigate-paste-body"
              value={pasteBody}
              onChange={(event) => {
                const next = event.target.value
                setPasteBody(next)
                setPasteBodyError(
                  sourceAddPasteBodyCount(next).over
                    ? sourceAddPasteBodyIssue(next)
                    : pasteBodyError && next.trim()
                      ? null
                      : pasteBodyError,
                )
              }}
              aria-invalid={pasteBodyError ? true : undefined}
              aria-describedby={describedBy(
                'investigate-paste-count',
                pasteBodyError && 'investigate-paste-body-error',
              )}
            />
            <p
              id="investigate-paste-count"
              className={`mt-1 text-sm ${pasteCount.over ? 'text-red-600' : 'text-zinc-500'}`}
            >
              {pasteCount.current.toLocaleString('ja-JP')} / {pasteCount.max.toLocaleString('ja-JP')}
            </p>
            {pasteBodyError ? (
              <Alert id="investigate-paste-body-error" className="mt-2">
                {pasteBodyError}
              </Alert>
            ) : null}
          </div>
          <Button type="submit" className="gap-2" disabled={jobPending || paste.isPending || pasteCount.over}>
            {paste.isPending ? <PendingMark /> : null}
            本文を貼り付ける
          </Button>
        </form>
      ) : null}

      <section
        className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-700"
        aria-label="要約"
      >
        <h3 className="text-sm font-medium text-zinc-500">要約</h3>
        {source.summary ? (
          <CitedProse text={source.summary} citations={source.citations} emptyLabel="まだありません" />
        ) : jobPending && jobKind === 'summarize_body' ? (
          <ProgressLine view={progress} />
        ) : (
          <p>まだありません</p>
        )}
        {bodyForCursor ? (
          <div className="space-y-2">
            <Button
              className="gap-2"
              disabled={jobPending || summarize.isPending}
              onClick={() => summarize.mutate()}
              title={SUMMARIZE_SCOPE_DETAIL}
            >
              {summarize.isPending ? <PendingMark /> : null}
              {source.summary == null ? '要約する' : '再要約する'}
            </Button>
            {jobPending && jobKind !== 'summarize_body' ? (
              <p className="text-sm text-zinc-500">処理中のため要約できません。</p>
            ) : (
              <p className="text-sm text-zinc-500" title={SUMMARIZE_SCOPE_DETAIL}>
                {STUDY_SCOPE_SHORT}
              </p>
            )}
            {budget ? (
              <p className="text-sm text-zinc-500" title={budget.detail}>
                {budget.label}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">本文を貼り付けると要約できます。</p>
        )}
      </section>

      <section className="space-y-3" aria-label="質問">
        <h3 className="text-sm font-medium text-zinc-500">質問</h3>
        {bodyForCursor ? (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              ask.mutate(questionDraft)
            }}
          >
            <label htmlFor="investigate-question" className="mb-1 block text-sm font-medium">
              質問
            </label>
            <Textarea
              id="investigate-question"
              name="question"
              required
              value={questionDraft}
              onChange={(event) => setQuestionDraft(event.target.value)}
              placeholder="このソースについて質問"
              maxLength={4000}
              disabled={ask.isPending}
            />
            <Button
              type="submit"
              className="gap-2"
              disabled={jobPending || ask.isPending || questionDraft.trim() === ''}
            >
              {ask.isPending ? <PendingMark /> : null}
              質問する
            </Button>
            {jobPending && jobKind !== 'ask_source' ? (
              <p className="text-sm text-zinc-500">処理中のため質問できません。</p>
            ) : (
              <p className="text-sm text-zinc-500" title={ASK_SCOPE_DETAIL}>
                {STUDY_SCOPE_SHORT}
              </p>
            )}
            {budget ? (
              <p className="text-sm text-zinc-500" title={budget.detail}>
                {budget.label}
              </p>
            ) : null}
          </form>
        ) : (
          <p className="text-sm text-zinc-500">本文を貼り付けると質問できます。</p>
        )}
        {source.qaAnswers.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">まだ質問はありません</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {source.qaAnswers.map((turn) => {
              const turnView = qaTurnView(turn, jobInput)
              const deletingThis = deletingQaId === turn.id
              const deleteBusyId = `${turn.id}-delete-busy`
              return (
                <li
                  key={turn.id}
                  className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
                  aria-busy={deletingThis || undefined}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1 border-l-2 border-zinc-400 pl-3 dark:border-zinc-500">
                      <p className="text-xs font-semibold tracking-wide text-zinc-500">質問</p>
                      <p className="whitespace-pre-wrap">{turn.question}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-2 text-red-700 dark:text-red-300"
                      disabled={!turn.canDelete || deletingThis}
                      aria-label="この質問と回答を削除"
                      aria-describedby={!turn.canDelete ? deleteBusyId : undefined}
                      onClick={() => setPendingQa({ id: turn.id, question: turn.question })}
                    >
                      {deletingThis ? <PendingMark /> : null}
                      {deletingThis ? '削除しています' : '削除'}
                    </Button>
                  </div>
                  <div className="mt-3 space-y-2 border-l-2 border-zinc-900 pl-3 dark:border-zinc-100">
                    <p className="text-xs font-semibold tracking-wide text-zinc-500">回答</p>
                    {turnView.phase === 'ready' ? (
                      <CitedProse text={turn.answer ?? ''} citations={turn.citations} emptyLabel="回答待ち…" />
                    ) : turnView.phase === 'pending' ? (
                      <ProgressLine view={turnView.progress} />
                    ) : (
                      <div className="space-y-2">
                        <Alert>{jobStatusAlertText(turnView.progress)}</Alert>
                        {(turnView.progress.recovery ?? []).map((action) => (
                          <Button
                            key={action.id}
                            className="gap-2"
                            variant={action.id === 'retry' ? 'primary' : 'secondary'}
                            disabled={studyBusy}
                            onClick={() => runRecovery(action, turn.question)}
                          >
                            {ask.isPending && action.id === 'retry' ? <PendingMark /> : null}
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!turn.canDelete ? (
                    <p id={deleteBusyId} className="mt-2 text-sm text-zinc-500">
                      処理中のため削除できません。
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {actionError ? <Alert id="investigate-action-error">{actionError}</Alert> : null}
      {pendingQa ? (
        <ConfirmDialog
          open
          {...qaDeleteConfirm(pendingQa.question)}
          tone="danger"
          onCancel={() => setPendingQa(null)}
          onConfirm={() => {
            const qaAnswerId = pendingQa.id
            setPendingQa(null)
            deleteQa.mutate(qaAnswerId)
          }}
        />
      ) : null}
    </div>
  )
}
