import { QA_UNDO_WINDOW_MS } from '~/domain/qa-history'

export type QaDeleteEntry = {
  sourceId: string
  id: string
  question: string
  status: 'pending' | 'committing' | 'done' | 'failed'
  error?: string
}

const EMPTY: readonly QaDeleteEntry[] = []

/** Per-tab queue. Pending deletes are cancelled by a full page reload. */
export class QaDeleteQueue {
  private entries = new Map<string, QaDeleteEntry>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private listeners = new Set<() => void>()
  private snapshot: readonly QaDeleteEntry[] = EMPTY

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = () => this.snapshot
  getServerSnapshot = () => EMPTY

  private key(sourceId: string, id: string) { return `${sourceId}\0${id}` }

  private emit() {
    this.snapshot = [...this.entries.values()]
    for (const listener of this.listeners) listener()
  }

  private clearTimer(key: string) {
    const timer = this.timers.get(key)
    if (timer) clearTimeout(timer)
    this.timers.delete(key)
  }

  schedule(entry: Pick<QaDeleteEntry, 'sourceId' | 'id' | 'question'>, commit: () => Promise<void>) {
    const key = this.key(entry.sourceId, entry.id)
    this.clearTimer(key)
    this.entries.set(key, { ...entry, status: 'pending' })
    this.emit()
    this.timers.set(key, setTimeout(() => { void this.commit(key, commit) }, QA_UNDO_WINDOW_MS))
  }

  undo(sourceId: string, id: string) {
    const key = this.key(sourceId, id)
    if (this.entries.get(key)?.status !== 'pending') return
    this.clearTimer(key)
    this.entries.delete(key)
    this.emit()
  }

  dismiss(sourceId: string, id: string) {
    const key = this.key(sourceId, id)
    this.clearTimer(key)
    this.entries.delete(key)
    this.emit()
  }

  private async commit(key: string, run: () => Promise<void>) {
    const entry = this.entries.get(key)
    if (!entry || entry.status !== 'pending') return
    this.clearTimer(key)
    this.entries.set(key, { ...entry, status: 'committing' })
    this.emit()
    try {
      await run()
      this.entries.set(key, { ...entry, status: 'done' })
      this.emit()
      this.timers.set(key, setTimeout(() => this.dismiss(entry.sourceId, entry.id), 5_000))
    } catch {
      this.entries.set(key, { ...entry, status: 'failed',
        error: '削除に失敗しました。質問は戻りました。' })
      this.emit()
    }
  }
}

export const qaDeleteQueue = new QaDeleteQueue()
