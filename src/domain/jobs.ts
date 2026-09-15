import { z } from 'zod'

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

export class IllegalJobTransitionError extends Error {
  readonly code = 'illegal_job_transition' as const

  constructor(
    readonly from: JobStatus,
    readonly to: JobStatus,
  ) {
    super(`illegal job transition: ${from} -> ${to}`)
    this.name = 'IllegalJobTransitionError'
  }
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  const allowed = JOB_TRANSITIONS[from]
  if (!allowed.includes(to)) {
    throw new IllegalJobTransitionError(from, to)
  }
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === 'succeeded' || status === 'failed'
}

export function sanitizeErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 400)
}
