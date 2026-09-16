import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { AcquiredVia, FetchStatus, SourceKind } from '~/domain/url'
import type { JobKind, JobStatus } from '~/domain/jobs'
import { isTerminalJobStatus, jobErrorReason, JOB_ERROR_LABEL } from '~/domain/jobs'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'キュー待ち',
  starting_agent: 'Agent起動中',
  waiting_agent: '取得中',
  persisting: '保存中',
  succeeded: '完了',
  failed: '失敗しました',
}

const FETCH_STATUS_LABEL: Record<FetchStatus, string> = {
  none: '未取得',
  partial: '部分取得',
  full: '全文取得',
  failed: '取得失敗',
}

const ACQUIRED_VIA_LABEL: Record<AcquiredVia, string> = {
  fetch: '自動取得',
  paste: '手動貼り付け',
  upload: 'アップロード',
}

const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  url: 'URL',
  pdf: 'PDF',
  x: 'X',
}

export function jobStatusLabel(status: JobStatus | null, kind: JobKind | null = 'fetch'): string {
  if (!status) return '未処理'
  if (kind === 'summarize_body' && status === 'waiting_agent') return '要約中'
  return JOB_STATUS_LABEL[status]
}

export function fetchStatusLabel(status: string): string {
  return FETCH_STATUS_LABEL[status as FetchStatus] ?? status
}

export function acquiredViaLabel(value: string): string {
  return ACQUIRED_VIA_LABEL[value as AcquiredVia] ?? value
}

export function sourceKindLabel(value: string): string {
  return SOURCE_KIND_LABEL[value as SourceKind] ?? value
}

export function userFacingError(error: unknown): string {
  const message = error instanceof Error ? error.message : '操作に失敗しました'
  return JOB_ERROR_LABEL[message] ?? message
}

export { isTerminalJobStatus, jobErrorReason }
