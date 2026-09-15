import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { JobStatus } from '~/domain/jobs'
import { isTerminalJobStatus } from '~/domain/jobs'

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

export function jobStatusLabel(status: JobStatus | null): string {
  if (!status) return '未処理'
  return JOB_STATUS_LABEL[status]
}

export { isTerminalJobStatus }
