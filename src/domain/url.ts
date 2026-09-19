import { z } from 'zod'
import { notebookTargetSchema } from '~/domain/organization'
import { MAX_SOURCE_BODY_CHARS } from '~/domain/pdf'

export const MAX_PASTE_TITLE_CHARS = 500

export const sourceKindSchema = z.enum(['url', 'pdf', 'x'])
export type SourceKind = z.infer<typeof sourceKindSchema>

export const fetchStatusSchema = z.enum(['none', 'partial', 'full', 'failed'])
export type FetchStatus = z.infer<typeof fetchStatusSchema>

export const acquiredViaSchema = z.enum(['fetch', 'paste', 'upload'])
export type AcquiredVia = z.infer<typeof acquiredViaSchema>

const X_HOSTS = new Set(['x.com', 'twitter.com'])

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('invalid_url')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('unsupported_protocol')
  }
  parsed.hash = ''
  parsed.hostname = parsed.hostname.toLowerCase()
  if (
    (parsed.protocol === 'https:' && parsed.port === '443') ||
    (parsed.protocol === 'http:' && parsed.port === '80')
  ) {
    parsed.port = ''
  }
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  }
  return parsed.toString()
}

export function sourceKindFromUrl(url: string): SourceKind {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  if (X_HOSTS.has(host)) return 'x'
  return 'url'
}

export const registerUrlInputSchema = z.object({
  url: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.url()),
  notebook: notebookTargetSchema,
})

export const retrySourceInputSchema = z.object({
  sourceId: z.string().min(1),
})

const pasteBodySchema = z.object({
  title: z.string().trim().min(1).max(MAX_PASTE_TITLE_CHARS),
  body: z.string().trim().min(1).max(MAX_SOURCE_BODY_CHARS),
  url: z.string().optional(),
})

export const pasteSourceInputSchema = z.union([
  pasteBodySchema.extend({ sourceId: z.string().min(1) }),
  pasteBodySchema.extend({ notebook: notebookTargetSchema }),
])
export type PasteSourceInput = z.output<typeof pasteSourceInputSchema>

export { sourceListFilterSchema as listSourcesInputSchema } from '~/domain/organization'

export function parseAndNormalizeUrl(url: string): {
  original: string
  normalized: string
  kind: SourceKind
} {
  const original = url.trim()
  const normalized = normalizeUrl(original)
  return { original, normalized, kind: sourceKindFromUrl(normalized) }
}
