import { MAX_CURSOR_BODY_CHARS, storedBodyText } from '~/domain/ingest-result'
import {
  isTerminalJobStatus,
  jobErrorReason,
  type JobKind,
  type JobStatus,
} from '~/domain/jobs'

export type JobRecoveryId = 'retry' | 'paste-body'

export type JobRecoveryAction = {
  id: JobRecoveryId
  label: string
}

export type JobStatusTone = 'idle' | 'pending' | 'success' | 'failure'

export type JobStatusView = {
  label: string
  detail?: string
  recovery?: JobRecoveryAction[]
  pending: boolean
  tone: JobStatusTone
}

export type JobCopyInput = {
  status: JobStatus | null
  kind: JobKind | null
  errorCode: string | null
  errorMessage: string | null
  hasBody: boolean
  hasUrl: boolean
}

export type QaTurnPhase = 'ready' | 'pending' | 'failed'

export type QaTurnView =
  | { phase: 'ready' }
  | { phase: 'pending'; progress: JobStatusView }
  | { phase: 'failed'; progress: JobStatusView }

const PASTE_BODY: JobRecoveryAction = { id: 'paste-body', label: '本文を貼り付ける' }
const RETRY: JobRecoveryAction = { id: 'retry', label: '再試行' }
const RETRY_FETCH: JobRecoveryAction = { id: 'retry', label: '再取得' }

export const STUDY_SCOPE_SHORT = 'このソースの本文'
export const SUMMARIZE_SCOPE_DETAIL =
  '保存済みの本文だけを要約します。URLの再取得やPDFの再読み込みはしません。'
export const ASK_SCOPE_DETAIL = '保存済みの本文だけを使います。複数ソースはまだ選べません。'

export function studyScopeLabel(sourceTitle: string): string {
  return `回答元: ${sourceTitle}`
}

export function jobCopyInputFromSource(source: {
  body: string | null
  url: string | null
  job: {
    status: JobStatus
    kind: JobKind
    errorCode: string | null
    errorMessage: string | null
  } | null
}): JobCopyInput {
  return {
    status: source.job?.status ?? null,
    kind: source.job?.kind ?? null,
    errorCode: source.job?.errorCode ?? null,
    errorMessage: source.job?.errorMessage ?? null,
    hasBody: storedBodyText(source.body) !== null,
    hasUrl: Boolean(source.url?.trim()),
  }
}

export function jobProgressView(input: JobCopyInput): JobStatusView {
  const kind = input.kind ?? 'fetch'
  if (!input.status) {
    if (!input.hasBody) {
      return {
        label: '本文がありません',
        detail: '要約と質問には本文が必要です。ページからコピーして貼り付けてください。',
        recovery: [PASTE_BODY],
        pending: false,
        tone: 'idle',
      }
    }
    return { label: '未処理', pending: false, tone: 'idle' }
  }
  if (input.status === 'failed') {
    return failedView(input, kind)
  }
  if (input.status === 'succeeded') {
    if (!input.hasBody) {
      return {
        label: '本文がありません',
        detail: '要約と質問には本文が必要です。ページからコピーして貼り付けてください。',
        recovery: [PASTE_BODY],
        pending: false,
        tone: 'idle',
      }
    }
    return { label: '完了', pending: false, tone: 'success' }
  }
  return {
    label: pendingLabel(input.status, kind),
    pending: true,
    tone: 'pending',
  }
}

export function qaTurnView(
  turn: { answer: string | null; canDelete: boolean },
  latest: JobCopyInput,
): QaTurnView {
  if (turn.answer) return { phase: 'ready' }
  if (!turn.canDelete) {
    const askInFlight =
      latest.kind === 'ask_source' && latest.status !== null && !isTerminalJobStatus(latest.status)
    return {
      phase: 'pending',
      progress: askInFlight
        ? jobProgressView(latest)
        : {
            label: '回答を準備しています',
            pending: true,
            tone: 'pending',
          },
    }
  }
  const askFailed = latest.kind === 'ask_source' && latest.status === 'failed'
  return {
    phase: 'failed',
    progress: askFailed
      ? jobProgressView(latest)
      : {
          label: '回答できませんでした',
          detail: 'この質問への回答は残っていません。同じ内容をもう一度送れます。',
          pending: false,
          tone: 'failure',
        },
  }
}

export function jobCompletionAnnouncement(
  previousStatus: JobStatus | null,
  next: { status: JobStatus | null; kind: JobKind | null },
): string | null {
  if (next.status !== 'succeeded') return null
  if (previousStatus === null || isTerminalJobStatus(previousStatus)) return null
  if (next.kind === 'summarize_body') return '要約が完了しました'
  if (next.kind === 'ask_source') return '回答が完了しました'
  if (next.kind === 'fetch') return '本文の取得が完了しました'
  return '処理が完了しました'
}

export function cursorBodyBudgetCopy(truncated: boolean): { label: string; detail: string } | null {
  if (!truncated) return null
  const limit = MAX_CURSOR_BODY_CHARS.toLocaleString('ja-JP')
  return {
    label: '本文を切り詰めました',
    detail: `先頭${limit}文字だけを使います。それ以降は要約や回答に含まれません。長いソースは分けて登録してください。`,
  }
}

function pendingLabel(status: Exclude<JobStatus, 'succeeded' | 'failed'>, kind: JobKind): string {
  switch (status) {
    case 'queued':
      return kind === 'summarize_body'
        ? '要約を準備しています'
        : kind === 'ask_source'
          ? '回答を準備しています'
          : '本文の取得を準備しています'
    case 'starting_agent':
      return '処理を始めています'
    case 'waiting_agent':
      return kind === 'summarize_body'
        ? '要約しています'
        : kind === 'ask_source'
          ? '回答しています'
          : '本文を取得しています'
    case 'persisting':
      return '結果を保存しています'
    default: {
      const _never: never = status
      return _never
    }
  }
}

function failLabel(kind: JobKind): string {
  switch (kind) {
    case 'summarize_body':
      return '要約できませんでした'
    case 'ask_source':
      return '回答できませんでした'
    case 'fetch':
      return '本文を取得できませんでした'
    default: {
      const _never: never = kind
      return _never
    }
  }
}

type ErrorFamily = 'timeout' | 'config' | 'no-body' | 'fetch' | 'generic'

function errorFamily(code: string | null, kind: JobKind): ErrorFamily {
  if (code === 'timeout') return 'timeout'
  if (code === 'cursor_not_configured') return 'config'
  if (code === 'source_has_no_body') return 'no-body'
  if (kind === 'fetch') return 'fetch'
  return 'generic'
}

function joinCopy(cause: string, impact: string): string {
  const head = /[。．.!?！？]$/.test(cause) ? cause : `${cause}。`
  return `${head}${impact}`
}

function failedView(input: JobCopyInput, kind: JobKind): JobStatusView {
  const family = errorFamily(input.errorCode, kind)
  const cause = jobErrorReason(input.errorCode, input.errorMessage, kind)
  const label = failLabel(kind)

  if (family === 'config') {
    return {
      label,
      detail: joinCopy(cause, 'このアプリの管理者に設定を依頼してください。設定後に再試行できます。'),
      pending: false,
      tone: 'failure',
    }
  }

  if (family === 'timeout') {
    const recovery: JobRecoveryAction[] = []
    if (kind === 'fetch') {
      if (input.hasUrl) recovery.push(RETRY)
      recovery.push(PASTE_BODY)
    } else {
      recovery.push(RETRY)
    }
    const impact =
      kind === 'fetch'
        ? '要約と質問は本文が揃ってから使えます。もう一度取得するか、本文を貼り付けてください。'
        : 'もう一度試せます。'
    return {
      label,
      detail: joinCopy(cause, impact),
      recovery,
      pending: false,
      tone: 'failure',
    }
  }

  if (family === 'fetch' || family === 'no-body') {
    const recovery: JobRecoveryAction[] = [PASTE_BODY]
    if (family === 'fetch' && input.hasUrl) recovery.push(RETRY_FETCH)
    return {
      label,
      detail: joinCopy(cause, '要約と質問には本文が必要です。ページからコピーして貼り付けてください。'),
      recovery,
      pending: false,
      tone: 'failure',
    }
  }

  return {
    label,
    detail: joinCopy(cause, 'もう一度試せます。'),
    recovery: [RETRY],
    pending: false,
    tone: 'failure',
  }
}
