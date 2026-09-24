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

/** Only edits awaiting a successful save belong in local draft storage. */
export function shouldWriteMemoDraft(saveState: MemoSaveState): boolean {
  return saveState === 'dirty' || saveState === 'saving' || saveState === 'error'
}

/** A save acknowledges only the submitted text, not edits made while it was in flight. */
export function memoStateAfterSave(draft: string, savedMemo: string): MemoSaveState {
  return draft === savedMemo ? 'saved' : 'dirty'
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
