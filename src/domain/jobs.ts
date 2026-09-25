import { Data, Effect } from 'effect'
import { z } from 'zod'
import { runSyncFail } from '~/lib/effect-run'

export const jobKindSchema = z.enum(['fetch', 'summarize_body', 'ask_source'])
export type JobKind = z.infer<typeof jobKindSchema>

export const jobStatusSchema = z.enum([
  'queued',
  'starting_agent',
  'waiting_agent',
  'persisting',
  'succeeded',
  'failed',
])

export type JobStatus = z.infer<typeof jobStatusSchema>

export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  queued: ['starting_agent', 'failed'],
  starting_agent: ['waiting_agent', 'failed'],
  waiting_agent: ['waiting_agent', 'persisting', 'failed'],
  persisting: ['succeeded', 'failed'],
  succeeded: [],
  failed: [],
}

export class IllegalJobTransitionError extends Data.TaggedError('IllegalJobTransitionError')<{
  readonly from: JobStatus
  readonly to: JobStatus
}> {}

export function assertTransitionEffect(
  from: JobStatus,
  to: JobStatus,
): Effect.Effect<void, IllegalJobTransitionError> {
  const allowed = JOB_TRANSITIONS[from]
  if (!allowed.includes(to)) {
    return Effect.fail(new IllegalJobTransitionError({ from, to }))
  }
  return Effect.void
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  runSyncFail(assertTransitionEffect(from, to))
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === 'succeeded' || status === 'failed'
}

export function canStartCursorJob(status: JobStatus | null): boolean {
  return status === null || isTerminalJobStatus(status)
}

const FETCH_ERROR_LABEL: Record<string, string> = {
  fetch_result_failed: 'ページの再取得に失敗しました',
  workflow_start_failed: '取得ワークフローを開始できませんでした',
  cursor_run_failed: 'Cursor による取得が失敗しました',
  timeout: '取得が時間切れになりました',
  ingest_failed: '取得処理に失敗しました',
  ingest_result_not_json: '取得結果の形式が不正でした',
}

const SUMMARIZE_ERROR_LABEL: Record<string, string> = {
  workflow_start_failed: '要約ワークフローを開始できませんでした',
  cursor_run_failed: 'Cursor による要約が失敗しました',
  timeout: '要約が時間切れになりました',
  ingest_failed: '要約処理に失敗しました',
  ingest_result_not_json: '要約結果の形式が不正でした',
}

const ASK_ERROR_LABEL: Record<string, string> = {
  workflow_start_failed: '質問ワークフローを開始できませんでした',
  cursor_run_failed: 'Cursor による回答が失敗しました',
  timeout: '質問が時間切れになりました',
  ingest_failed: '質問処理に失敗しました',
  ingest_result_not_json: '回答結果の形式が不正でした',
}

export const JOB_ERROR_LABEL: Record<string, string> = {
  ...FETCH_ERROR_LABEL,
  cursor_not_configured: 'Cursor APIキーが設定されていません',
  source_not_found: 'ソースが見つかりません',
  source_has_no_url: 'このソースには再取得できるURLがありません',
  source_has_no_body: 'このソースには使える本文がありません',
  question_empty: '質問を入力してください',
  qa_answer_not_found: '質問が見つかりません',
  qa_answer_in_progress: '処理中の質問は削除できません',
  source_in_progress: '処理中のソースは削除できません',
  job_in_progress: '処理中です。完了してから貼り付けてください',
  pdf_not_pdf: 'PDFファイルを選んでください',
  pdf_too_large: 'PDFは8MB以下にしてください',
  pdf_empty_file: 'ファイルが空です',
  expected_form_data: 'アップロードの形式が不正です',
  notebook_not_found: 'ノートブックが見つかりません',
  notebook_in_progress: '処理中のソースがあるノートは削除できません',
  notebook_title_taken: '同じ名前のノートブックがあります',
  source_already_registered: 'このURLは別のノートに登録されています',
  invalid_url: '有効なURLではありません。https://example.com のように入力してください',
  unsupported_protocol: 'http または https のURLだけ登録できます',
}

export function jobErrorReason(
  code: string | null,
  message: string | null,
  kind: JobKind = 'fetch',
): string {
  const kindLabels =
    kind === 'summarize_body' ? SUMMARIZE_ERROR_LABEL : kind === 'ask_source' ? ASK_ERROR_LABEL : FETCH_ERROR_LABEL
  const label = code
    ? (kindLabels[code] ?? JOB_ERROR_LABEL[code] ?? '失敗しました')
    : '失敗しました'
  const detail = message?.trim() ?? ''
  if (detail && detail !== code) return `${label}: ${detail}`
  return label
}

export function sanitizeErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 400)
}
