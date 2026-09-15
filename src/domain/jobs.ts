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

export function sanitizeErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 400)
}
