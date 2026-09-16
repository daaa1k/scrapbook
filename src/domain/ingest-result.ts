import { z } from 'zod'
import { citationListSchema } from '~/domain/citations'

export const ingestResultSchema = z.object({
  title: z.string(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  body: z.string(),
  summary: z.string(),
  fetchStatus: z.enum(['full', 'partial', 'failed']),
  failureReason: z.string().nullable(),
  citations: citationListSchema,
})

export type IngestResult = z.infer<typeof ingestResultSchema>

export const summarizeResultSchema = z.object({
  summary: z.string().min(1),
  citations: citationListSchema,
})

export type SummarizeResult = z.infer<typeof summarizeResultSchema>

export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  if (fenced?.[1]) return fenced[1].trim()
  const inner = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (inner?.[1]) return inner[1].trim()
  return trimmed
}

function parseJsonObject(raw: string): unknown {
  const stripped = stripMarkdownFences(raw)
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('ingest_result_not_json')
  }
  return JSON.parse(stripped.slice(start, end + 1)) as unknown
}

export function parseIngestResultJson(raw: string): IngestResult {
  return ingestResultSchema.parse(parseJsonObject(raw))
}

export function parseSummarizeResultJson(raw: string): SummarizeResult {
  return summarizeResultSchema.parse(parseJsonObject(raw))
}

export function storedBodyText(body: string | null | undefined): string | null {
  const trimmed = body?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
