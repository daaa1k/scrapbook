export function likeContainsPattern(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const escaped = trimmed.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
  return `%${escaped}%`
}
