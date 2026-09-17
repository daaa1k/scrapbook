import type { AppDb } from '../../src/db/types'
import type { NotebookId } from '../../src/domain/organization'
import type { ParsedPdfUpload, PdfExtractor } from '../../src/domain/pdf'
import type { AssetsPort } from '../../src/server/ingest/pdf'
import { registerPdfSource as registerPdfSourceRaw } from '../../src/server/ingest/pdf'
import {
  pasteSourceBody as pasteSourceBodyRaw,
  registerUrlSource as registerUrlSourceRaw,
} from '../../src/server/ingest/register'
import type { WorkflowBinding } from '../../src/server/ingest/start-workflow'
import { seedNotebook } from './notebook'

export async function pasteSourceBody(
  db: AppDb,
  input: { sourceId?: string; title: string; body: string; url?: string; notebookId?: NotebookId },
) {
  if (input.sourceId || input.notebookId) return pasteSourceBodyRaw(db, input)
  const notebookId = await seedNotebook(db)
  return pasteSourceBodyRaw(db, { ...input, notebookId })
}

export async function registerUrlSource(
  db: AppDb,
  input: { url: string; notebookId?: NotebookId },
  workflow: WorkflowBinding | undefined,
) {
  const notebookId = input.notebookId ?? (await seedNotebook(db))
  return registerUrlSourceRaw(db, { url: input.url, notebookId }, workflow)
}

export async function registerPdfSource(
  db: AppDb,
  assets: AssetsPort,
  upload: ParsedPdfUpload,
  extract: PdfExtractor,
  notebookId?: NotebookId,
) {
  return registerPdfSourceRaw(db, assets, upload, extract, notebookId ?? (await seedNotebook(db)))
}
