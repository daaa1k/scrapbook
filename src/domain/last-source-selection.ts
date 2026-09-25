const KEY_PREFIX = 'scrapbook-last-source:'

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readLastSourceSelection(notebookId: string): string | null {
  try {
    return storage()?.getItem(`${KEY_PREFIX}${notebookId}`) || null
  } catch {
    return null
  }
}

export function writeLastSourceSelection(notebookId: string, sourceId: string): void {
  try {
    storage()?.setItem(`${KEY_PREFIX}${notebookId}`, sourceId)
  } catch {
    // The notebook still opens when browser storage is disabled.
  }
}

export function clearLastSourceSelection(notebookId: string): void {
  try {
    storage()?.removeItem(`${KEY_PREFIX}${notebookId}`)
  } catch {
    // Ignore unavailable browser storage.
  }
}

export function resumableSourceId(storedId: string | null, sourceIds: readonly string[]): string | null {
  return storedId && sourceIds.includes(storedId) ? storedId : null
}
