/** Whether a memo draft needs to be persisted. */
export function shouldSaveMemo(draft: string, lastSaved: string | null): boolean {
  return draft !== (lastSaved ?? '')
}
