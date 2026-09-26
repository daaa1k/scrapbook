import { afterEach, describe, expect, it, vi } from 'vitest'
import { QaDeleteQueue } from '../src/domain/qa-delete-queue'
import { QA_UNDO_WINDOW_MS } from '../src/domain/qa-history'

afterEach(() => vi.useRealTimers())

describe('QaDeleteQueue', () => {
  it('commits independent reservations after one is undone and no view remains subscribed', async () => {
    vi.useFakeTimers()
    const queue = new QaDeleteQueue()
    const first = vi.fn(async () => {})
    const second = vi.fn(async () => {})
    const listener = vi.fn()
    const unsubscribe = queue.subscribe(listener)
    queue.schedule({ sourceId: 'source', id: 'first', question: 'first?' }, first)
    queue.schedule({ sourceId: 'source', id: 'second', question: 'second?' }, second)
    expect(queue.getSnapshot()).toHaveLength(2)
    queue.undo('source', 'first')
    unsubscribe()
    await vi.advanceTimersByTimeAsync(QA_UNDO_WINDOW_MS)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(queue.getSnapshot()).toMatchObject([{ id: 'second', status: 'done' }])
    await vi.advanceTimersByTimeAsync(5_000)
    expect(queue.getSnapshot()).toEqual([])
    expect(listener).toHaveBeenCalled()
  })

  it('restores a failed delete and exposes an error after the timer', async () => {
    vi.useFakeTimers()
    const queue = new QaDeleteQueue()
    queue.schedule({ sourceId: 'source', id: 'failed', question: 'failed?' },
      async () => { throw new Error('database unavailable') })
    await vi.advanceTimersByTimeAsync(QA_UNDO_WINDOW_MS)
    expect(queue.getSnapshot()).toMatchObject([{
      id: 'failed', status: 'failed', error: '削除に失敗しました。質問は戻りました。',
    }])
    queue.dismiss('source', 'failed')
    expect(queue.getSnapshot()).toEqual([])
  })
})
