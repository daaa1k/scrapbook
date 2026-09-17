import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { jobs, notebooks, sources } from '../src/db/schema'
import type { AppDb } from '../src/db/types'
import {
  MAX_PDF_BYTES,
  parsePdfUpload,
  persistablePdfBody,
  pdfTextHelp,
  titleFromFilename,
  type ParsedPdfUpload,
  type PdfExtractor,
} from '../src/domain/pdf'
import type { AssetsPort } from '../src/server/ingest/pdf'
import { pasteSourceBody } from '../src/server/ingest/register'
import { findSourcesByQuery } from '../src/server/ingest/search'
import {
  extractPdfTextWithUnpdf,
  pdfOriginalKey,
  registerPdfSource as registerPdfSourceRaw,
  respondWithPdfOriginal,
} from '../src/server/ingest/pdf'
import { createTestDb } from './helpers/db'
import { seedNotebook } from './helpers/notebook'
import { createMemoryAssets } from './helpers/r2'

const HELLO_PDF = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 51 >>stream
BT /F1 12 Tf 20 100 Td (scrapbook-hello) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000374 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
445
%%EOF`

function helloPdfBytes(): Uint8Array {
  return new TextEncoder().encode(HELLO_PDF)
}

async function registerPdfSource(
  db: AppDb,
  assets: AssetsPort,
  upload: ParsedPdfUpload,
  extract: PdfExtractor,
) {
  const notebookId = await seedNotebook(db)
  return registerPdfSourceRaw(db, assets, upload, extract, notebookId)
}

function productionEnv() {
  return {
    ENVIRONMENT: 'production',
    ALLOW_INSECURE_AUTH_BYPASS: 'true',
    ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    ACCESS_AUD: 'test-aud',
    ACCESS_ALLOWED_EMAILS: 'you@example.com',
  }
}

function bypassEnv() {
  return {
    ENVIRONMENT: 'development',
    ALLOW_INSECURE_AUTH_BYPASS: 'true',
    ACCESS_TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
    ACCESS_AUD: 'test-aud',
    ACCESS_ALLOWED_EMAILS: 'you@example.com',
  }
}

describe('pdf parse', () => {
  it('rejects non-PDF bytes even when the filename ends in .pdf', () => {
    expect(() => parsePdfUpload({ bytes: new TextEncoder().encode('hello'), filename: 'x.pdf' })).toThrow(
      'pdf_not_pdf',
    )
  })

  it('rejects oversized PDFs', () => {
    const bytes = new Uint8Array(MAX_PDF_BYTES + 1)
    bytes[0] = 0x25
    bytes[1] = 0x50
    bytes[2] = 0x44
    bytes[3] = 0x46
    expect(() => parsePdfUpload({ bytes, filename: 'big.pdf' })).toThrow('pdf_too_large')
  })

  it('rejects an empty file', () => {
    expect(() => parsePdfUpload({ bytes: new Uint8Array(), filename: 'empty.pdf' })).toThrow('pdf_empty_file')
  })

  it('accepts magic %PDF and derives a title from the filename', () => {
    const parsed = parsePdfUpload({ bytes: helloPdfBytes(), filename: '/tmp/dir/note.pdf' })
    expect(parsed.title).toBe('note.pdf')
    expect(parsed.bytes.byteLength).toBe(helloPdfBytes().byteLength)
  })

  it('falls back to a Japanese untitled name', () => {
    expect(titleFromFilename('  ')).toBe('無題のPDF')
  })

  it('caps persisted body length', () => {
    const result = persistablePdfBody(`あ`.repeat(200_001))
    expect(result.fetchStatus).toBe('partial')
    expect(result.body).toHaveLength(200_000)
  })
})

describe('pdf register', () => {
  it('stores the original, extracts injected text, and creates no job', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: helloPdfBytes(), filename: '講義.pdf' })
    const result = await registerPdfSource(db, assets, upload, async () => ({
      kind: 'text',
      text: '抽出本文',
    }))

    const row = (await db.select().from(sources).where(eq(sources.id, result.sourceId)))[0]
    const book = (await db.select().from(notebooks).where(eq(notebooks.id, row!.notebookId)))[0]
    const jobRows = await db.select().from(jobs).where(eq(jobs.sourceId, result.sourceId))
    const stored = await assets.get(pdfOriginalKey(result.sourceId))

    expect(row?.kind).toBe('pdf')
    expect(row?.acquiredVia).toBe('upload')
    expect(row?.title).toBe('講義.pdf')
    expect(row?.url).toBeNull()
    expect(row?.normalizedUrl).toBeNull()
    expect(row?.body).toBe('抽出本文')
    expect(row?.summary).toBeNull()
    expect(row?.memo).toBeNull()
    expect(row?.fetchStatus).toBe('full')
    expect(row?.contentHash).toBeTruthy()
    expect(row?.r2Key).toBe(`pdf/${result.sourceId}/original.pdf`)
    expect(book?.title).toBe('研究')
    expect(jobRows).toHaveLength(0)
    expect(stored).toEqual(upload.bytes)
  })

  it('extracts scrapbook-hello with unpdf', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: helloPdfBytes(), filename: 'hello.pdf' })
    const result = await registerPdfSource(db, assets, upload, extractPdfTextWithUnpdf)
    const row = (await db.select().from(sources).where(eq(sources.id, result.sourceId)))[0]
    expect(row?.body).toContain('scrapbook-hello')
    expect(row?.fetchStatus).toBe('full')
  })

  it('keeps the original when extract is empty', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: helloPdfBytes(), filename: 'scan.pdf' })
    const result = await registerPdfSource(db, assets, upload, async () => ({ kind: 'empty' }))
    const row = (await db.select().from(sources).where(eq(sources.id, result.sourceId)))[0]
    const stored = await assets.get(pdfOriginalKey(result.sourceId))
    expect(row?.fetchStatus).toBe('failed')
    expect(row?.body).toBeNull()
    expect(stored?.byteLength).toBe(upload.bytes.byteLength)
    expect(pdfTextHelp({ kind: row!.kind, body: row!.body })).toBe(
      'テキストを抽出できませんでした。スキャンされたPDFの場合は、下のフォームから本文を貼り付けてください。',
    )
  })

  it('pastes over an uploaded PDF without dropping the original', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: helloPdfBytes(), filename: 'a.pdf' })
    const registered = await registerPdfSource(db, assets, upload, async () => ({ kind: 'empty' }))
    await pasteSourceBody(db, {
      sourceId: registered.sourceId,
      title: '貼り付け後',
      body: 'スキャンの本文',
    })
    const row = (await db.select().from(sources).where(eq(sources.id, registered.sourceId)))[0]
    expect(row?.kind).toBe('pdf')
    expect(row?.r2Key).toBe(`pdf/${registered.sourceId}/original.pdf`)
    expect(row?.acquiredVia).toBe('paste')
    expect(row?.fetchStatus).toBe('full')
    expect(row?.title).toBe('貼り付け後')
    expect(row?.body).toBe('スキャンの本文')
  })

  it('finds an extracted PDF body by search', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: helloPdfBytes(), filename: 'search.pdf' })
    await registerPdfSource(db, assets, upload, async () => ({ kind: 'text', text: '抽出ヒット' }))
    const hits = await findSourcesByQuery(db, '抽出ヒット')
    expect(hits.map((row) => row.title)).toEqual(['search.pdf'])
  })
})

describe('pdf serve', () => {
  it('returns 401 without a token when production refuses bypass', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const response = await respondWithPdfOriginal({
      sourceId: 'missing',
      request: new Request('https://scrapbook.example/assets/sources/missing'),
      env: productionEnv(),
      db,
      assets,
      download: false,
    })
    expect(response.status).toBe(401)
    expect(await response.text()).toBe('unauthorized')
  })

  it('returns stored bytes when auth bypass is allowed', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: helloPdfBytes(), filename: 'serve.pdf' })
    const registered = await registerPdfSource(db, assets, upload, async () => ({
      kind: 'text',
      text: '本文',
    }))
    const response = await respondWithPdfOriginal({
      sourceId: registered.sourceId,
      request: new Request(`https://scrapbook.example/assets/sources/${registered.sourceId}`),
      env: bypassEnv(),
      db,
      assets,
      download: false,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-disposition')).toContain('inline')
    const body = new Uint8Array(await response.arrayBuffer())
    expect(body).toEqual(upload.bytes)
  })

  it('uses attachment disposition when download is requested', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const upload = parsePdfUpload({ bytes: helloPdfBytes(), filename: 'serve.pdf' })
    const registered = await registerPdfSource(db, assets, upload, async () => ({ kind: 'empty' }))
    const response = await respondWithPdfOriginal({
      sourceId: registered.sourceId,
      request: new Request(`https://scrapbook.example/assets/sources/${registered.sourceId}?download=1`),
      env: bypassEnv(),
      db,
      assets,
      download: true,
    })
    expect(response.headers.get('content-disposition')).toContain('attachment')
  })

  it('returns 404 for a URL source', async () => {
    const { db } = createTestDb()
    const assets = createMemoryAssets()
    const pasted = await pasteSourceBody(db, { title: 'URLノート', body: '本文', notebookId: await seedNotebook(db) })
    const response = await respondWithPdfOriginal({
      sourceId: pasted.sourceId,
      request: new Request(`https://scrapbook.example/assets/sources/${pasted.sourceId}`),
      env: bypassEnv(),
      db,
      assets,
      download: false,
    })
    expect(response.status).toBe(404)
  })
})
