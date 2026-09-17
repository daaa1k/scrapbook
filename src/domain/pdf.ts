import { notebookTargetSchema, type NotebookTarget } from '~/domain/organization'

export const MAX_PDF_BYTES = 8 * 1024 * 1024
export const MAX_SOURCE_BODY_CHARS = 200_000
export const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46])

export type PdfBytes = Uint8Array & { readonly __brand: 'PdfBytes' }

export type ParsedPdfUpload = {
  bytes: PdfBytes
  title: string
}

export type PdfExtractResult =
  | { kind: 'text'; text: string }
  | { kind: 'empty' }
  | { kind: 'error' }

export type PdfExtractor = (bytes: PdfBytes) => Promise<PdfExtractResult>

export function titleFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() ?? ''
  if (!base) return '無題のPDF'
  return base.slice(0, 500)
}

export function parsePdfUpload(input: { bytes: Uint8Array; filename: string }): ParsedPdfUpload {
  if (input.bytes.byteLength === 0) {
    throw new Error('pdf_empty_file')
  }
  if (input.bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('pdf_too_large')
  }
  if (
    input.bytes.byteLength < PDF_MAGIC.byteLength ||
    PDF_MAGIC.some((byte, index) => input.bytes[index] !== byte)
  ) {
    throw new Error('pdf_not_pdf')
  }
  return {
    bytes: input.bytes as PdfBytes,
    title: titleFromFilename(input.filename),
  }
}

export function parseRegisterPdfForm(data: unknown): { file: File; notebook: NotebookTarget } {
  if (!(data instanceof FormData)) {
    throw new Error('expected_form_data')
  }
  const file = data.get('file')
  if (!(file instanceof File)) {
    throw new Error('pdf_not_pdf')
  }
  const notebookRaw = data.get('notebook')
  if (typeof notebookRaw !== 'string') {
    throw new Error('notebook_not_found')
  }
  return { file, notebook: notebookTargetSchema.parse(notebookRaw) }
}

export function persistablePdfBody(text: string): { body: string; fetchStatus: 'full' | 'partial' } {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_SOURCE_BODY_CHARS) {
    return { body: trimmed, fetchStatus: 'full' }
  }
  return { body: trimmed.slice(0, MAX_SOURCE_BODY_CHARS), fetchStatus: 'partial' }
}

export function sourceOriginalPath(sourceId: string): string {
  return `/assets/sources/${sourceId}`
}

export function pdfTextHelp(input: { kind: string; body: string | null }): string | null {
  if (input.kind !== 'pdf') return null
  if (input.body) return null
  return 'テキストを抽出できませんでした。スキャンされたPDFの場合は、下のフォームから本文を貼り付けてください。'
}
