import { extractHtmlDocumentTitle } from '~/domain/html-meta'

const DEFAULT_TIMEOUT_MS = 3_000
const MAX_BODY_BYTES = 512_000

function isHtmlishContentType(value: string | null): boolean {
  if (!value || value.trim() === '') return true
  const lower = value.toLowerCase()
  return lower.includes('html') || lower.includes('text/')
}

async function readBodyCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) {
    const buffer = await response.arrayBuffer()
    const bytes = buffer.byteLength > maxBytes ? buffer.slice(0, maxBytes) : buffer
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  }

  const chunks: Uint8Array[] = []
  let total = 0
  while (total < maxBytes) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value || value.byteLength === 0) continue
    const take = Math.min(value.byteLength, maxBytes - total)
    chunks.push(take === value.byteLength ? value : value.subarray(0, take))
    total += take
  }
  try {
    await reader.cancel()
  } catch {}

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

export async function fetchUrlPageTitle(
  url: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<string | null> {
  const fetchImpl = options?.fetchImpl ?? fetch
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'text/html' },
    })
    if (!response.ok) return null
    if (!isHtmlishContentType(response.headers.get('content-type'))) return null
    const html = await readBodyCapped(response, MAX_BODY_BYTES)
    return extractHtmlDocumentTitle(html)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
