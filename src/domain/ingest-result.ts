import { z } from 'zod'

export const ingestResultSchema = z.object({
  title: z.string(),
  author: z.string().nullable(),
  publishedAt: z.string().nullable(),
  body: z.string(),
  summary: z.string(),
  fetchStatus: z.enum(['full', 'partial', 'failed']),
  failureReason: z.string().nullable(),
})

export type IngestResult = z.infer<typeof ingestResultSchema>

export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  if (fenced?.[1]) return fenced[1].trim()
  const inner = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (inner?.[1]) return inner[1].trim()
  return trimmed
}

export function parseIngestResultJson(raw: string): IngestResult {
  const stripped = stripMarkdownFences(raw)
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('ingest_result_not_json')
  }
  const parsed: unknown = JSON.parse(stripped.slice(start, end + 1))
  return ingestResultSchema.parse(parsed)
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
