export type CopyTextResult = 'ok' | 'fail'

export async function copyText(text: string): Promise<CopyTextResult> {
  const value = text.trim()
  if (value === '') return 'fail'
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return 'ok'
    } catch {
      // fall through to textarea fallback
    }
  }
  if (typeof document === 'undefined') return 'fail'
  try {
    const area = document.createElement('textarea')
    area.value = value
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok ? 'ok' : 'fail'
  } catch {
    return 'fail'
  }
}
