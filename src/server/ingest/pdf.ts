import { eq } from 'drizzle-orm'
import { sources } from '~/db/schema'
import type { AppDb } from '~/db/types'
import { sha256Hex } from '~/domain/ingest-result'
import {
  persistablePdfBody,
  type PdfBytes,
  type PdfExtractResult,
  type PdfExtractor,
  type ParsedPdfUpload,
} from '~/domain/pdf'
import { authenticateAccessRequest, type AccessEnv } from '~/server/auth/access'
import { ensureInboxNotebook } from '~/server/organization'

export type R2ObjectKey = string & { readonly __brand: 'R2ObjectKey' }

export type AssetsPort = {
  put: (key: R2ObjectKey, bytes: PdfBytes) => Promise<void>
  get: (key: R2ObjectKey) => Promise<Uint8Array | null>
  delete: (key: R2ObjectKey) => Promise<void>
}

export function workerAssets(bucket: R2Bucket): AssetsPort {
  return {
    async put(key, bytes) {
      await bucket.put(key, bytes, {
        httpMetadata: { contentType: 'application/pdf' },
      })
    },
    async get(key) {
      const object = await bucket.get(key)
      if (!object) return null
      return new Uint8Array(await object.arrayBuffer())
    },
    async delete(key) {
      await bucket.delete(key)
    },
  }
}

export function pdfOriginalKey(sourceId: string): R2ObjectKey {
  return `pdf/${sourceId}/original.pdf` as R2ObjectKey
}

export type RegisterPdfResult = {
  sourceId: string
}

export async function extractPdfTextWithUnpdf(bytes: PdfBytes): Promise<PdfExtractResult> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const document = await getDocumentProxy(bytes)
    const extracted = await extractText(document, { mergePages: true })
    const raw = extracted.text
    const text = Array.isArray(raw) ? raw.join('\n') : String(raw)
    const trimmed = text.trim()
    if (!trimmed) return { kind: 'empty' }
    return { kind: 'text', text: trimmed }
  } catch {
    return { kind: 'error' }
  }
}

export async function registerPdfSource(
  db: AppDb,
  assets: AssetsPort,
  upload: ParsedPdfUpload,
  extract: PdfExtractor,
): Promise<RegisterPdfResult> {
  const sourceId = crypto.randomUUID()
  const key = pdfOriginalKey(sourceId)
  await assets.put(key, upload.bytes)

  const notebookId = await ensureInboxNotebook(db)
  const ts = Date.now()
  try {
    await db.insert(sources).values({
      id: sourceId,
      notebookId,
      kind: 'pdf',
      url: null,
      normalizedUrl: null,
      title: upload.title,
      author: null,
      publishedAt: null,
      fetchedAt: null,
      body: null,
      summary: null,
      contentHash: null,
      fetchStatus: 'failed',
      acquiredVia: 'upload',
      r2Key: key,
      createdAt: ts,
      updatedAt: ts,
    })
  } catch (error) {
    try {
      await assets.delete(key)
    } catch {}
    throw error
  }

  let extracted: PdfExtractResult
  try {
    extracted = await extract(upload.bytes)
  } catch {
    extracted = { kind: 'error' }
  }

  if (extracted.kind !== 'text') {
    return { sourceId }
  }

  const persistable = persistablePdfBody(extracted.text)
  const hash = await sha256Hex(persistable.body)
  const now = Date.now()
  await db
    .update(sources)
    .set({
      body: persistable.body,
      contentHash: hash,
      fetchStatus: persistable.fetchStatus,
      fetchedAt: now,
      updatedAt: now,
    })
    .where(eq(sources.id, sourceId))

  return { sourceId }
}

export type ServePdfInput = {
  sourceId: string
  request: Request
  env: AccessEnv
  db: AppDb
  assets: AssetsPort
  download: boolean
}

function contentDisposition(title: string, download: boolean): string {
  const type = download ? 'attachment' : 'inline'
  const filename = title.toLowerCase().endsWith('.pdf') ? title : `${title}.pdf`
  const ascii = filename.replace(/[^\u0020-\u007e]/g, '_') || 'document.pdf'
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function respondWithPdfOriginal(input: ServePdfInput): Promise<Response> {
  try {
    await authenticateAccessRequest(input.request, input.env)
  } catch {
    return new Response('unauthorized', {
      status: 401,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  const rows = await input.db.select().from(sources).where(eq(sources.id, input.sourceId)).limit(1)
  const row = rows[0]
  if (!row || row.kind !== 'pdf' || !row.r2Key) {
    return new Response(null, { status: 404 })
  }

  const bytes = await input.assets.get(row.r2Key as R2ObjectKey)
  if (!bytes) {
    return new Response(null, { status: 404 })
  }

  const title = row.title ?? 'document.pdf'
  return new Response(Uint8Array.from(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, no-store',
      'content-disposition': contentDisposition(title, input.download),
    },
  })
}
