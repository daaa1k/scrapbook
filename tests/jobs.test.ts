import { describe, expect, it } from 'vitest'
import { JOB_TRANSITIONS, IllegalJobTransitionError, assertTransition } from '../src/domain/jobs'

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

  it('throws on illegal transitions including from terminals', () => {
    expect(() => assertTransition('queued', 'succeeded')).toThrow(IllegalJobTransitionError)
    expect(() => assertTransition('succeeded', 'failed')).toThrow(IllegalJobTransitionError)
    expect(() => assertTransition('failed', 'queued')).toThrow(IllegalJobTransitionError)
    expect(() => assertTransition('persisting', 'waiting_agent')).toThrow(IllegalJobTransitionError)
  })

  it('encodes terminals as empty adjacency lists', () => {
    expect(JOB_TRANSITIONS.succeeded).toEqual([])
    expect(JOB_TRANSITIONS.failed).toEqual([])
  })
})
