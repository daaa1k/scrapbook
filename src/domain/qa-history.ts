export const QA_UNDO_WINDOW_MS = 8_000

export type PendingQaUndo = {
  id: string
  question: string
  answer: string | null
  canDelete: boolean
  citations: readonly unknown[]
  expiresAt: number
}

export function qaUndoIsActive(undo: PendingQaUndo | null, now = Date.now()): boolean {
  return undo != null && undo.expiresAt > now
}

export function qaUndoRemainingMs(undo: PendingQaUndo, now = Date.now()): number {
  return Math.max(0, undo.expiresAt - now)
}

export function filterQaTurnsByQuery<T extends { question: string; answer: string | null }>(
  turns: readonly T[],
  q: string,
): T[] {
  const needle = q.trim().toLocaleLowerCase('ja')
  if (needle === '') return [...turns]
  return turns.filter((turn) => {
    const hay = `${turn.question}\n${turn.answer ?? ''}`.toLocaleLowerCase('ja')
    return hay.includes(needle)
  })
}

export const QA_HISTORY_COLLAPSE_AFTER = 3

export function qaTurnsCollapsed<T>(
  turns: readonly T[],
  collapsed: boolean,
  keep = QA_HISTORY_COLLAPSE_AFTER,
): { visible: T[]; hiddenCount: number } {
  if (!collapsed || turns.length <= keep) {
    return { visible: [...turns], hiddenCount: 0 }
  }
  const hiddenCount = turns.length - keep
  return { visible: turns.slice(0, keep), hiddenCount }
}
