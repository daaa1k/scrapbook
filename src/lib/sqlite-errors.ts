export function isUniqueConstraintError(error: unknown): boolean {
  let current: unknown = error
  while (current instanceof Error) {
    if (/UNIQUE constraint failed/i.test(current.message)) return true
    current = current.cause
  }
  return false
}
