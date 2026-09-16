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
import { jobStatusLabel, userFacingError } from '../src/lib/utils'

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
    expect(jobErrorReason('cursor_run_failed', 'Cursor run ended: ERROR', 'summarize_body')).toBe(
      'Cursor による要約が失敗しました: Cursor run ended: ERROR',
    )
    expect(jobErrorReason('timeout', null, 'summarize_body')).toBe('要約が時間切れになりました')
    expect(jobErrorReason('source_has_no_body', null)).toBe('このソースには使える本文がありません')
    expect(jobErrorReason('cursor_run_failed', 'Cursor run ended: ERROR', 'ask_source')).toBe(
      'Cursor による回答が失敗しました: Cursor run ended: ERROR',
    )
    expect(jobErrorReason('timeout', null, 'ask_source')).toBe('質問が時間切れになりました')
  })

  it('maps source_has_no_body for user-facing errors', () => {
    expect(userFacingError(new Error('source_has_no_body'))).toBe('このソースには使える本文がありません')
    expect(userFacingError(new Error('question_empty'))).toBe('質問を入力してください')
  })

  it('labels in-flight summarize jobs as 要約中', () => {
    expect(jobStatusLabel('waiting_agent', 'fetch')).toBe('取得中')
    expect(jobStatusLabel('waiting_agent', 'summarize_body')).toBe('要約中')
    expect(jobStatusLabel('waiting_agent', 'ask_source')).toBe('回答中')
  })
})
