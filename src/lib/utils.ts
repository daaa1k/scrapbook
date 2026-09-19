import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { jobProgressView } from '~/domain/job-status-copy'
import type { JobKind, JobStatus } from '~/domain/jobs'
import { isTerminalJobStatus, jobErrorReason, JOB_ERROR_LABEL } from '~/domain/jobs'
import type { AcquiredVia, FetchStatus, SourceKind } from '~/domain/url'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
  return jobProgressView({
    status,
    kind,
    errorCode: null,
    errorMessage: null,
    hasBody: true,
    hasUrl: true,
  }).label
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
  if (error instanceof TypeError && /failed to fetch/i.test(error.message)) {
    return '通信に失敗しました'
  }
  const message = error instanceof Error ? error.message : '操作に失敗しました'
  return JOB_ERROR_LABEL[message] ?? message
}

export { isTerminalJobStatus, jobErrorReason }
