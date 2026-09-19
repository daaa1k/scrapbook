export type MemoSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export type MemoSession = {
  sourceId: string
  draft: string
  lastSaved: string
  saveState: MemoSaveState
}

export type MemoSessionHandle = {
  needsGuard: boolean
  flush: () => Promise<void>
  discard: () => void
}

/** Whether a memo draft needs to be persisted. */
export function shouldSaveMemo(draft: string, lastSaved: string | null): boolean {
  return draft !== (lastSaved ?? '')
}

export function memoNeedsLeaveGuard(session: Pick<MemoSession, 'draft' | 'lastSaved' | 'saveState'>): boolean {
  if (session.saveState === 'error' || session.saveState === 'saving') return true
  return shouldSaveMemo(session.draft, session.lastSaved)
}

export function discardedMemoSession(session: MemoSession): MemoSession {
  return {
    sourceId: session.sourceId,
    draft: session.lastSaved,
    lastSaved: session.lastSaved,
    saveState: 'idle',
  }
}

export function applyServerMemo(
  session: MemoSession,
  incoming: { sourceId: string; serverMemo: string },
): MemoSession {
  if (session.sourceId !== incoming.sourceId) {
    return {
      sourceId: incoming.sourceId,
      draft: incoming.serverMemo,
      lastSaved: incoming.serverMemo,
      saveState: 'idle',
    }
  }
  if (session.saveState !== 'idle' || session.draft !== session.lastSaved) {
    return session
  }
  if (session.draft === incoming.serverMemo) return session
  return {
    sourceId: session.sourceId,
    draft: incoming.serverMemo,
    lastSaved: incoming.serverMemo,
    saveState: 'idle',
  }
}

export function isLeavingNotebook(
  currentNotebookId: string | undefined,
  nextNotebookId: string | undefined,
): boolean {
  return currentNotebookId !== nextNotebookId
}
