import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  JOB_TRANSITIONS,
  IllegalJobTransitionError,
  assertTransition,
  assertTransitionEffect,
  canStartCursorJob,
  jobErrorReason,
} from '../src/domain/jobs'

describe('job transitions', () => {
  it('allows the documented edges', () => {
    assertTransition('queued', 'starting_agent')
    assertTransition('queued', 'failed')
    assertTransition('starting_agent', 'waiting_agent')
    assertTransition('waiting_agent', 'waiting_agent')
    assertTransition('waiting_agent', 'persisting')
    assertTransition('persisting', 'succeeded')
    assertTransition('persisting', 'failed')
  })

  it('fails illegal transitions on the Effect error channel', async () => {
    const exit = await Effect.runPromiseExit(assertTransitionEffect('queued', 'succeeded'))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit) && exit.cause._tag === 'Fail') {
      expect(exit.cause.error).toBeInstanceOf(IllegalJobTransitionError)
      expect(exit.cause.error._tag).toBe('IllegalJobTransitionError')
      expect(exit.cause.error.from).toBe('queued')
      expect(exit.cause.error.to).toBe('succeeded')
    }
    expect(() => assertTransition('succeeded', 'failed')).toThrow(IllegalJobTransitionError)
    expect(() => assertTransition('failed', 'queued')).toThrow(IllegalJobTransitionError)
    expect(() => assertTransition('persisting', 'waiting_agent')).toThrow(IllegalJobTransitionError)
  })

  it('encodes terminals as empty adjacency lists', () => {
    expect(JOB_TRANSITIONS.succeeded).toEqual([])
    expect(JOB_TRANSITIONS.failed).toEqual([])
  })

  it('allows a new Cursor job only when the latest job is missing or terminal', () => {
    expect(canStartCursorJob(null)).toBe(true)
    expect(canStartCursorJob('failed')).toBe(true)
    expect(canStartCursorJob('succeeded')).toBe(true)
    expect(canStartCursorJob('queued')).toBe(false)
    expect(canStartCursorJob('waiting_agent')).toBe(false)
  })

  it('renders a Japanese reason for a failed job', () => {
    expect(jobErrorReason('cursor_run_failed', 'Cursor run ended: ERROR')).toBe(
      'Cursor による取得が失敗しました: Cursor run ended: ERROR',
    )
    expect(jobErrorReason('timeout', null)).toBe('取得が時間切れになりました')
  })
})
