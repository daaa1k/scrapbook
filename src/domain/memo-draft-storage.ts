const MEMO_DRAFT_PREFIX = 'scrapbook-memo-draft:'

export function memoDraftStorageKey(sourceId: string): string {
  return `${MEMO_DRAFT_PREFIX}${sourceId}`
}

export function readLocalMemoDraft(sourceId: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(memoDraftStorageKey(sourceId))
  } catch {
    return null
  }
}

export function writeLocalMemoDraft(sourceId: string, draft: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(memoDraftStorageKey(sourceId), draft)
  } catch {
    // private mode / quota
  }
}

export function clearLocalMemoDraft(sourceId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(memoDraftStorageKey(sourceId))
  } catch {
    // ignore
  }
}

/** Offer restore when a local draft differs from the loaded server memo and session is idle. */
export function shouldOfferMemoDraftRestore(
  serverMemo: string,
  localDraft: string | null,
  sessionIdle: boolean,
): boolean {
  if (!sessionIdle) return false
  if (localDraft == null) return false
  return localDraft !== serverMemo
}
