import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
import { qaDeleteQueue } from '~/domain/qa-delete-queue'
import {
  filterQaTurnsByQuery,
  qaTurnsCollapsed,
} from '~/domain/qa-history'
import {
  COPY_FAILURE_ANNOUNCEMENT,
  COPY_SUCCESS_ANNOUNCEMENT,
  QUESTION_EXAMPLES,
} from '~/domain/source-list-controls'
import {
  sourceAddPasteBodyCount,
  sourceAddPasteBodyIssue,
  sourceAddPasteTitleIssue,
} from '~/domain/source-add'
import { STUDY_LOADING_LABEL } from '~/domain/note-shell'
import { sourceBodyDateLabel, sourceDateTime } from '~/domain/source-dates'
import { acceptedPasteDraft, acceptedQuestionDraft, type SourceInputDraft } from '~/domain/source-input-drafts'
import { isModEnter } from '~/domain/shortcuts'
import { copyText } from '~/lib/clipboard'
import { sourceKeys } from '~/lib/query-keys'
import { isTerminalJobStatus, userFacingError } from '~/lib/utils'
import { scrollElementIntoVisualViewport } from '~/lib/visual-viewport'
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
  draft: SourceInputDraft
  updateDraft: (sourceId: string, update: (draft: SourceInputDraft) => SourceInputDraft) => void
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
    <p className="flex items-center gap-2 text-sm text-muted">
      {view.pending ? <PendingMark /> : null}
      <span>{view.label}</span>
    </p>
  )
}

export function SourceInvestigate({ sourceId, draft, updateDraft }: SourceInvestigateProps) {
  const queryClient = useQueryClient()
  const questionDraft = draft.question
  const pasteTitle = draft.pasteTitle ?? ''
  const pasteBody = draft.pasteBody
  const pasteRequested = draft.pasteRequested
  const changeDraft = (update: (current: SourceInputDraft) => SourceInputDraft) => updateDraft(sourceId, update)
  const [questionNotSent, setQuestionNotSent] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pasteTitleError, setPasteTitleError] = useState<string | null>(null)
  const [pasteBodyError, setPasteBodyError] = useState<string | null>(null)
  const [pasteHasNewEdits, setPasteHasNewEdits] = useState(false)
  const [completionAnnouncement, setCompletionAnnouncement] = useState('')
  const [copyAnnouncement, setCopyAnnouncement] = useState('')
  const [pendingQa, setPendingQa] = useState<{ id: string; question: string } | null>(null)
  const [pendingReuse, setPendingReuse] = useState<string | null>(null)
  const qaEntries = useSyncExternalStore(qaDeleteQueue.subscribe, qaDeleteQueue.getSnapshot, qaDeleteQueue.getServerSnapshot)
    .filter((entry) => entry.sourceId === sourceId)
  const [qaSearch, setQaSearch] = useState('')
  const [qaCollapsed, setQaCollapsed] = useState(true)
  const previousJobStatus = useRef<JobStatus | null | undefined>(undefined)
  const pasteTitleRef = useRef(pasteTitle)
  const pasteBodyRef = useRef(pasteBody)
  pasteTitleRef.current = pasteTitle
  pasteBodyRef.current = pasteBody
  const qaListRef = useRef<HTMLUListElement | null>(null)

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
    if (source?.title?.trim()) {
      changeDraft((current) => current.pasteTitle === null
        ? { ...current, pasteTitle: source.title } : current)
    }
  }, [source?.title])

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

  useEffect(() => {
    function keepAskActionsVisible() {
      if (document.activeElement?.id !== 'investigate-question') return
      const actions = document.getElementById('investigate-ask-actions')
      if (actions) scrollElementIntoVisualViewport(actions)
    }
    const vv = window.visualViewport
    vv?.addEventListener('resize', keepAskActionsVisible)
    vv?.addEventListener('scroll', keepAskActionsVisible)
    return () => {
      vv?.removeEventListener('resize', keepAskActionsVisible)
      vv?.removeEventListener('scroll', keepAskActionsVisible)
    }
  }, [])

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
    onMutate: () => setQuestionNotSent(false),
    onSuccess: async (result, question) => {
      setActionError(null)
      if (result.started) {
        changeDraft((current) => acceptedQuestionDraft(current, question))
      } else {
        setQuestionNotSent(true)
      }
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
    onMutate: () => setPasteHasNewEdits(false),
    onSuccess: async (_result, input) => {
      setActionError(null)
      if (pasteTitleRef.current === input.title && pasteBodyRef.current === input.body) {
        changeDraft((current) => acceptedPasteDraft(current, input))
      } else {
        changeDraft((current) => ({ ...current, pasteRequested: true }))
        setPasteHasNewEdits(true)
      }
      setPasteTitleError(null)
      setPasteBodyError(null)
      await invalidateSource()
    },
    onError: (error) => setActionError(userFacingError(error)),
  })

  function scheduleQaDelete(turn: { id: string; question: string }) {
    qaDeleteQueue.schedule({ sourceId, id: turn.id, question: turn.question }, async () => {
      await deleteSourceQaAnswer({ data: { sourceId, qaAnswerId: turn.id } })
      await queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId) })
    })
  }

  const visibleQaAnswers = useMemo(() => {
    if (!source) return []
    const withoutPending = source.qaAnswers.filter((turn) =>
      !qaEntries.some((entry) => entry.id === turn.id && entry.status !== 'failed'))
    return filterQaTurnsByQuery(withoutPending, qaSearch)
  }, [source, qaEntries, qaSearch])

  const { visible: listedQaAnswers, hiddenCount: collapsedHiddenCount } = useMemo(
    () => qaTurnsCollapsed(visibleQaAnswers, qaCollapsed),
    [visibleQaAnswers, qaCollapsed],
  )

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
  const publishedDate = sourceDateTime(source.publishedAt)
  const bodyDate = sourceDateTime(bodyForCursor ? source.fetchedAt : null)
  const hasPasteDraft = pasteBody !== '' || (draft.pasteTitle !== null && pasteTitle !== (source.title ?? ''))
  const showPasteForm = pasteRequested || hasPasteDraft || (!jobInput.hasBody && !jobPending)
  const pasteCount = sourceAddPasteBodyCount(pasteBody)
  const studyBusy =
    summarize.isPending || ask.isPending || retry.isPending || paste.isPending || jobPending
  const deletingQaIds = qaEntries.filter((entry) => entry.status === 'committing').map((entry) => entry.id)
  const recoveryActions = (progress.recovery ?? []).filter(
    (action) => action.id !== 'paste-body' || !showPasteForm,
  )
  const showJobRecoveryCard =
    (progress.tone === 'failure' && jobKind !== 'ask_source') ||
    (!jobInput.hasBody && !jobPending && progress.tone !== 'failure')

  function runRecovery(action: JobRecoveryAction, question?: string) {
    if (action.id === 'paste-body') {
      changeDraft((current) => ({ ...current, pasteRequested: true }))
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

  async function copyPlainText(text: string) {
    const result = await copyText(text)
    setCopyAnnouncement(result === 'ok' ? COPY_SUCCESS_ANNOUNCEMENT : COPY_FAILURE_ANNOUNCEMENT)
  }

  function scrollToLatestAnswer() {
    const first = listedQaAnswers[0]
    if (!first) return
    const node = document.getElementById(`qa-turn-${first.id}`)
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function reuseQuestion(question: string) {
    if (questionDraft.trim() && questionDraft !== question) {
      setPendingReuse(question)
      return
    }
    changeDraft((current) => ({ ...current, question }))
    document.getElementById('investigate-question')?.focus()
  }

  return (
    <div className="flex min-h-full flex-col gap-6" aria-busy={studyBusy || undefined}>
      {query.isError ? (
        <div className="space-y-2 rounded-md border border-border bg-surface-muted p-inset" role="status">
          <p>最新の状態を取得できませんでした。表示中の内容は古い可能性があります。</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void query.refetch()}>
            表示を更新
          </Button>
        </div>
      ) : null}
      <header className="space-y-2">
        <p className="break-anywhere text-lg font-semibold">
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
        <p className="text-sm text-muted">{studyScopeLabel(title)}</p>
        <dl className="grid gap-x-3 gap-y-1 text-meta text-muted sm:grid-cols-[max-content_1fr]">
          <dt>公開日</dt>
          <dd>{publishedDate ? <time dateTime={publishedDate.dateTime}>{publishedDate.label}</time> : '不明'}</dd>
          <dt>{sourceBodyDateLabel(source.acquiredVia)}</dt>
          <dd>{bodyDate ? <time dateTime={bodyDate.dateTime}>{bodyDate.label}</time> : '不明'}</dd>
        </dl>
        {progress.tone === 'pending' ? <ProgressLine view={progress} /> : null}
        <p id="investigate-job-complete" className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {completionAnnouncement}
        </p>
        <p id="investigate-copy-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {copyAnnouncement}
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

      {!showPasteForm && !jobPending ? (
        <Button type="button" variant="secondary" onClick={() =>
          changeDraft((current) => ({ ...current, pasteRequested: true }))}>
          本文を貼り付ける
        </Button>
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
          <h3 className="text-sm font-medium text-muted">本文を貼り付ける</h3>
          {pasteHasNewEdits ? (
            <Alert role="status">保存中に変更した内容はまだ保存されていません。確認して再度保存してください。</Alert>
          ) : null}
          <div>
            <label htmlFor="investigate-paste-title" className="mb-1 block text-sm font-medium">
              タイトル
            </label>
            <Input
              id="investigate-paste-title"
              name="investigate-paste-title"
              value={pasteTitle}
              onChange={(event) => {
                pasteTitleRef.current = event.target.value
                changeDraft((current) => ({ ...current, pasteTitle: event.target.value }))
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
                pasteBodyRef.current = next
                changeDraft((current) => ({ ...current, pasteBody: next }))
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
              className={`mt-1 text-sm ${pasteCount.over ? 'text-danger' : 'text-muted'}`}
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
          {hasPasteDraft || pasteRequested ? (
            <Button type="button" variant="secondary" onClick={() => {
              changeDraft((current) => ({
                ...current, pasteTitle: source.title ?? '', pasteBody: '', pasteRequested: false,
              }))
              setPasteTitleError(null)
              setPasteBodyError(null)
            }}>
              貼付下書きを破棄
            </Button>
          ) : null}
        </form>
      ) : null}

      <section
        className="space-y-3 rounded-md border border-zinc-200 p-4 dark:border-zinc-700"
        aria-label="要約"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted">要約</h3>
          {source.summary ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void copyPlainText(source.summary ?? '')}
            >
              コピー
            </Button>
          ) : null}
        </div>
        {source.summary ? (
          <CitedProse
            text={source.summary}
            citations={source.citations}
            emptyLabel="まだありません"
            onCopyAnnouncement={setCopyAnnouncement}
          />
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
              <p className="text-sm text-muted">処理中のため要約できません。</p>
            ) : (
              <p className="text-sm text-muted" title={SUMMARIZE_SCOPE_DETAIL}>
                {STUDY_SCOPE_SHORT}
              </p>
            )}
            {budget ? (
              <p className="text-sm text-muted" title={budget.detail}>
                {budget.label}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">本文を貼り付けると要約できます。</p>
        )}
      </section>

      <section className="space-y-3" aria-label="質問">
        <h3 className="text-sm font-medium text-muted">質問</h3>
        {bodyForCursor ? (
          <form
            className="flex flex-col space-y-3"
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
              onChange={(event) => changeDraft((current) => ({ ...current, question: event.target.value }))}
              onKeyDown={(event) => {
                if (!isModEnter(event)) return
                event.preventDefault()
                if (jobPending || ask.isPending || questionDraft.trim() === '') return
                ask.mutate(questionDraft)
              }}
              onFocus={() => {
                window.requestAnimationFrame(() => {
                  const actions = document.getElementById('investigate-ask-actions')
                  if (actions) scrollElementIntoVisualViewport(actions)
                })
              }}
              placeholder="このソースについて質問"
              maxLength={4000}
              className="break-anywhere"
              aria-describedby={describedBy(
                'investigate-ask-shortcut',
                questionNotSent && 'investigate-question-not-sent',
              )}
            />
            {questionNotSent ? (
              <Alert id="investigate-question-not-sent">
                別の処理が実行中だったため、質問は送信されませんでした。処理が完了したら、もう一度「質問する」を押してください。
              </Alert>
            ) : null}
            <p id="investigate-ask-shortcut" className="text-meta text-muted">
              ⌘/Ctrl + Enter で送信
            </p>
            <div
              id="investigate-ask-actions"
              className="sticky bottom-0 z-[1] -mx-1 space-y-2 bg-inherit px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-2"
            >
              <Button
                type="submit"
                className="min-h-11 w-full gap-2 sm:w-auto"
                disabled={jobPending || ask.isPending || questionDraft.trim() === ''}
              >
                {ask.isPending ? <PendingMark /> : null}
                質問する
              </Button>
              {questionDraft !== '' ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => {
                  changeDraft((current) => ({ ...current, question: '' }))
                  setQuestionNotSent(false)
                }}>
                  質問下書きを破棄
                </Button>
              ) : null}
              {jobPending && jobKind !== 'ask_source' ? (
                <p className="text-sm text-muted">処理中のため質問できません。</p>
              ) : (
                <p className="text-sm text-muted" title={ASK_SCOPE_DETAIL}>
                  {STUDY_SCOPE_SHORT}
                </p>
              )}
              {budget ? (
                <p className="text-sm text-muted" title={budget.detail}>
                  {budget.label}
                </p>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted">本文を貼り付けると質問できます。</p>
        )}
        {source.qaAnswers.length === 0 && qaEntries.length === 0 ? (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-muted">まだ質問はありません</p>
            {bodyForCursor ? (
              <div className="space-y-2">
                <p className="text-meta font-medium text-muted">質問例</p>
                <ul className="flex flex-col gap-2">
                  {QUESTION_EXAMPLES.map((example) => (
                    <li key={example}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-auto min-h-11 w-full justify-start whitespace-normal text-left"
                        onClick={() => changeDraft((current) => ({ ...current, question: example }))}
                      >
                        {example}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {qaEntries.map((entry) => (
              <div key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface-muted p-inset"
                role="status">
                <p className="text-sm text-ink">
                  {entry.status === 'pending' ? `「${entry.question}」を削除予約中です。再読み込みすると予約は取り消されます。`
                    : entry.status === 'committing' ? `「${entry.question}」を削除しています。`
                      : entry.status === 'done' ? `「${entry.question}」を削除しました。`
                        : `「${entry.question}」: ${entry.error}`}
                </p>
                {entry.status === 'pending' ? (
                  <Button type="button" variant="secondary" size="sm"
                    onClick={() => qaDeleteQueue.undo(sourceId, entry.id)}>元に戻す</Button>
                ) : entry.status === 'failed' || entry.status === 'done' ? (
                  <Button type="button" variant="secondary" size="sm"
                    onClick={() => qaDeleteQueue.dismiss(sourceId, entry.id)}>閉じる</Button>
                ) : null}
              </div>
            ))}
            <div className="flex flex-wrap items-end gap-gap">
              <div className="min-w-[10rem] flex-1">
                <label htmlFor="investigate-qa-search" className="mb-1 block text-meta font-medium text-muted">
                  履歴を検索
                </label>
                <Input
                  id="investigate-qa-search"
                  type="search"
                  value={qaSearch}
                  onChange={(event) => setQaSearch(event.target.value)}
                  placeholder="質問や回答"
                  autoComplete="off"
                />
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={scrollToLatestAnswer}>
                最新へ
              </Button>
              {visibleQaAnswers.length > 3 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setQaCollapsed((value) => !value)}
                >
                  {qaCollapsed ? `古い質問を表示（${collapsedHiddenCount}）` : '折りたたむ'}
                </Button>
              ) : null}
            </div>
            {listedQaAnswers.length === 0 ? (
              <p className="text-sm text-muted">一致する質問はありません</p>
            ) : (
              <ul ref={qaListRef} className="space-y-3">
                {listedQaAnswers.map((turn) => {
                  const turnView = qaTurnView(turn)
                  const deletingThis = deletingQaIds.includes(turn.id)
                  const deleteBusyId = `${turn.id}-delete-busy`
                  return (
                    <li
                      id={`qa-turn-${turn.id}`}
                      key={turn.id}
                      className="rounded-md border border-zinc-200 p-3 dark:border-zinc-700"
                      aria-busy={deletingThis || undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-1 border-l-2 border-zinc-400 pl-3 dark:border-zinc-500">
                          <p className="text-xs font-semibold tracking-wide text-muted">質問</p>
                          <p className="break-anywhere whitespace-pre-wrap">{turn.question}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="tap-target min-h-11 gap-2 text-red-700 dark:text-red-300"
                          disabled={!turn.canDelete || deletingThis}
                          aria-label="この質問と回答を削除"
                          aria-describedby={!turn.canDelete ? deleteBusyId : undefined}
                          onClick={() => setPendingQa({ id: turn.id, question: turn.question })}
                        >
                          {deletingThis ? <PendingMark /> : null}
                          {deletingThis ? '削除しています' : '削除'}
                        </Button>
                      </div>
                      <Button type="button" variant="secondary" size="sm" className="mt-2"
                        onClick={() => reuseQuestion(turn.question)}>
                        編集して質問
                      </Button>
                      <div className="mt-3 space-y-2 border-l-2 border-zinc-900 pl-3 dark:border-zinc-100">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold tracking-wide text-muted">回答</p>
                          {turnView.phase === 'ready' && turn.answer ? (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void copyPlainText(turn.answer ?? '')}
                            >
                              コピー
                            </Button>
                          ) : null}
                        </div>
                        {turnView.phase === 'ready' ? (
                          <CitedProse
                            text={turn.answer ?? ''}
                            citations={turn.citations}
                            emptyLabel="回答待ち…"
                            onCopyAnnouncement={setCopyAnnouncement}
                          />
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
                                onClick={() => {
                                  if (action.id === 'retry') ask.mutate(turn.question)
                                  else runRecovery(action, turn.question)
                                }}
                              >
                                {ask.isPending && action.id === 'retry' ? <PendingMark /> : null}
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                      {!turn.canDelete ? (
                        <p id={deleteBusyId} className="mt-2 text-sm text-muted">
                          処理中のため削除できません。
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {actionError ? <Alert id="investigate-action-error">{actionError}</Alert> : null}
      {pendingReuse !== null ? (
        <ConfirmDialog open title="質問下書きを置き換えますか？"
          description="入力中の質問が消えます。" confirmLabel="置き換える" tone="default"
          onCancel={() => setPendingReuse(null)}
          onConfirm={() => {
            const question = pendingReuse
            setPendingReuse(null)
            changeDraft((current) => ({ ...current, question }))
            window.requestAnimationFrame(() => document.getElementById('investigate-question')?.focus())
          }}
        />
      ) : null}
      {pendingQa ? (
        <ConfirmDialog
          open
          {...qaDeleteConfirm(pendingQa.question)}
          tone="danger"
          onCancel={() => setPendingQa(null)}
          onConfirm={() => {
            const turn = source.qaAnswers.find((row) => row.id === pendingQa.id)
            setPendingQa(null)
            if (!turn) return
            scheduleQaDelete(turn)
          }}
        />
      ) : null}
    </div>
  )
}
