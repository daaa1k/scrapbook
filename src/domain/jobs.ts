import { Data, Effect } from 'effect'
import { z } from 'zod'
import { runSyncFail } from '~/lib/effect-run'

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

export const JOB_ERROR_LABEL: Record<string, string> = {
  workflow_start_failed: '取得ワークフローを開始できませんでした',
  cursor_not_configured: 'Cursor APIキーが設定されていません',
  cursor_run_failed: 'Cursor による取得が失敗しました',
  timeout: '取得が時間切れになりました',
  ingest_failed: '取得処理に失敗しました',
  ingest_result_not_json: '取得結果の形式が不正でした',
  source_not_found: 'ソースが見つかりません',
  source_has_no_url: 'このソースには再取得できるURLがありません',
  job_in_progress: '取得処理中です。完了してから貼り付けてください',
  pdf_not_pdf: 'PDFファイルを選んでください',
  pdf_too_large: 'PDFは8MB以下にしてください',
  pdf_empty_file: 'ファイルが空です',
  expected_form_data: 'アップロードの形式が不正です',
}

export function jobErrorReason(code: string | null, message: string | null): string {
  const label = code ? (JOB_ERROR_LABEL[code] ?? '失敗しました') : '失敗しました'
  const detail = message?.trim() ?? ''
  if (detail && detail !== code) return `${label}: ${detail}`
  return label
}

export function sanitizeErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 400)
}
