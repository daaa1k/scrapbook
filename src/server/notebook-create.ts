import { eq } from 'drizzle-orm'
import { notebooks, sources } from '~/db/schema'
import type { AppDb } from '~/db/types'
import {
  notebookIdSchema,
  notebookTitleHint,
  uniqueNotebookTitle,
  type NotebookId,
} from '~/domain/organization'
import type { ParsedPdfUpload, PdfExtractor } from '~/domain/pdf'
import { parseAndNormalizeUrl } from '~/domain/url'
import type { AssetsPort } from '~/server/ingest/pdf'
import { registerPdfSource } from '~/server/ingest/pdf'
import { deleteSource, pasteSourceBody, registerUrlSource } from '~/server/ingest/register'
import type { WorkflowBinding } from '~/server/ingest/start-workflow'

export type CreateNotebookFirstSource =
  | { kind: 'url'; url: string; workflow?: WorkflowBinding }
  | { kind: 'paste'; title: string; body: string; url?: string }
  | { kind: 'pdf'; upload: ParsedPdfUpload; assets: AssetsPort; extract: PdfExtractor }

export async function createNotebookWithFirstSource(
  db: AppDb,
  input: CreateNotebookFirstSource,
  options?: { title?: string },
): Promise<{ notebookId: NotebookId; sourceId: string }> {
  if (input.kind === 'url') {
    const { normalized } = parseAndNormalizeUrl(input.url)
    const duplicates = await db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.normalizedUrl, normalized))
      .limit(1)
    if (duplicates[0]) throw new Error('source_already_registered')
  } else if (input.kind === 'paste' && input.url?.trim()) {
    const { normalized } = parseAndNormalizeUrl(input.url)
    const duplicates = await db
      .select({ id: sources.id })
      .from(sources)
      .where(eq(sources.normalizedUrl, normalized))
      .limit(1)
    if (duplicates[0]) throw new Error('source_already_registered')
  }

  const existingTitles = (await db.select({ title: notebooks.title }).from(notebooks)).map(
    (row) => row.title,
  )
  const hint =
    options?.title ??
    notebookTitleHint({
      sourceTitle: input.kind === 'paste' ? input.title : input.kind === 'pdf' ? input.upload.title : null,
      pdfFilename: input.kind === 'pdf' ? input.upload.title : null,
      url: input.kind === 'url' ? input.url : input.kind === 'paste' ? input.url : null,
    })
  const title = uniqueNotebookTitle(hint, existingTitles)
  const notebookId = notebookIdSchema.parse(crypto.randomUUID())
  const ts = Date.now()
  await db.insert(notebooks).values({
    id: notebookId,
    title,
    createdAt: ts,
    updatedAt: ts,
  })
  const assets = input.kind === 'pdf' ? input.assets : undefined
  try {
    if (input.kind === 'url') {
      const result = await registerUrlSource(db, { url: input.url, notebookId }, input.workflow)
      if (result.duplicate) throw new Error('source_already_registered')
      return { notebookId, sourceId: result.sourceId }
    }
    if (input.kind === 'paste') {
      const result = await pasteSourceBody(db, {
        title: input.title,
        body: input.body,
        url: input.url,
        notebookId,
      })
      return { notebookId, sourceId: result.sourceId }
    }
    const result = await registerPdfSource(db, input.assets, input.upload, input.extract, notebookId)
    return { notebookId, sourceId: result.sourceId }
  } catch (error) {
    await rollbackNotebookCreate(db, notebookId, assets)
    throw error
  }
}

async function rollbackNotebookCreate(
  db: AppDb,
  notebookId: NotebookId,
  assets: AssetsPort | undefined,
): Promise<void> {
  const sourceRows = await db.select({ id: sources.id }).from(sources).where(eq(sources.notebookId, notebookId))
  for (const row of sourceRows) {
    await deleteSource(db, row.id, assets, { force: true })
  }
  await db.delete(notebooks).where(eq(notebooks.id, notebookId))
}
