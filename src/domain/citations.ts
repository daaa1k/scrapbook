import { z } from 'zod'

export type BodyLocator =
  | { readonly kind: 'unanchored' }
  | { readonly kind: 'offsets'; readonly start: number; readonly end: number }

export type Citation = {
  readonly excerpt: string
  readonly locator: BodyLocator
}

export type CitationView = {
  readonly id: string
  readonly excerpt: string
  readonly bodySpan: { readonly start: number; readonly end: number } | null
}

export type CitationRow = {
  readonly id: string
  readonly locator: string
  readonly excerpt: string
}

const OFFSETS_LOCATOR = /^(\d+):(\d+)$/

export function encodeLocator(locator: BodyLocator): string {
  switch (locator.kind) {
    case 'unanchored':
      return '-'
    case 'offsets':
      return `${locator.start}:${locator.end}`
  }
}

export function decodeLocator(raw: string): BodyLocator {
  if (raw === '-') return { kind: 'unanchored' }
  const match = OFFSETS_LOCATOR.exec(raw)
  if (!match) return { kind: 'unanchored' }
  const start = Number.parseInt(match[1], 10)
  const end = Number.parseInt(match[2], 10)
  if (end > start) return { kind: 'offsets', start, end }
  return { kind: 'unanchored' }
}

export const citationSpanSchema = z
  .object({
    excerpt: z.string().trim().min(1),
    start: z.number().int().nonnegative().nullable().optional(),
    end: z.number().int().nonnegative().nullable().optional(),
  })
  .refine(
    (value) => {
      const start = value.start ?? null
      const end = value.end ?? null
      if (start === null && end === null) return true
      if (start === null || end === null) return false
      return end > start
    },
    { message: 'citation_offsets_invalid' },
  )
  .transform((value): Citation => {
    const start = value.start ?? null
    const end = value.end ?? null
    if (start === null || end === null) {
      return { excerpt: value.excerpt, locator: { kind: 'unanchored' } }
    }
    return { excerpt: value.excerpt, locator: { kind: 'offsets', start, end } }
  })

export const citationListSchema = z.array(citationSpanSchema).default([])

export const citationViewSchema = z.object({
  id: z.string().min(1),
  excerpt: z.string().min(1),
  bodySpan: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    })
    .refine((span) => span.end > span.start)
    .nullable(),
})

export function rebaseCitationsForStoredBody(
  citations: readonly Citation[],
  originalBody: string,
  storedBody: string,
  leadingTrimChars: number,
): Citation[] {
  return citations.map((citation) => {
    const locator = citation.locator
    if (locator.kind === 'unanchored') return citation
    const start = locator.start - leadingTrimChars
    const end = locator.end - leadingTrimChars
    if (
      originalBody.slice(locator.start, locator.end) !== citation.excerpt ||
      start < 0 || end > storedBody.length ||
      storedBody.slice(start, end) !== citation.excerpt
    ) {
      return { excerpt: citation.excerpt, locator: { kind: 'unanchored' } }
    }
    return { excerpt: citation.excerpt, locator: { kind: 'offsets', start, end } }
  })
}

export function citationViewFromRow(row: CitationRow, body: string | null): CitationView {
  const locator = decodeLocator(row.locator)
  const bodySpan =
    locator.kind === 'offsets' &&
    typeof body === 'string' &&
    body.length > 0 &&
    locator.end <= body.length &&
    body.slice(locator.start, locator.end) === row.excerpt
      ? { start: locator.start, end: locator.end }
      : null
  return { id: row.id, excerpt: row.excerpt, bodySpan }
}

export function citationBodyContext(body: string | null, citation: Pick<CitationView, 'excerpt' | 'bodySpan'>,
  radius = 80): { before: string; match: string; after: string; clippedBefore: boolean; clippedAfter: boolean } | null {
  const span = citation.bodySpan
  if (!body || !span || span.start < 0 || span.end > body.length ||
    body.slice(span.start, span.end) !== citation.excerpt) return null
  const start = Math.max(0, span.start - radius)
  const end = Math.min(body.length, span.end + radius)
  return {
    before: body.slice(start, span.start),
    match: body.slice(span.start, span.end),
    after: body.slice(span.end, end),
    clippedBefore: start > 0,
    clippedAfter: end < body.length,
  }
}
