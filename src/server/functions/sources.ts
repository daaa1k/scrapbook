import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { createDb } from '~/db/client'
import { sourceListFilterSchema } from '~/domain/organization'
import { parseRegisterPdfForm, parsePdfUpload } from '~/domain/pdf'
import { pasteSourceInputSchema, registerUrlInputSchema, retrySourceInputSchema } from '~/domain/url'
import { authMiddleware } from '~/server/auth/middleware'
import { pasteSourceBody, registerUrlSource, retrySourceIngest, askSourceQuestion, deleteQaAnswer, deleteSource, summarizeSourceBody } from '~/server/ingest/register'
import { extractPdfTextWithUnpdf, registerPdfSource, workerAssets } from '~/server/ingest/pdf'
import { listSourceViews, readSourceDetail } from '~/server/source-views'

const sourceIdInput = z.object({
  sourceId: z.string().min(1),
})

export const listSources = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(sourceListFilterSchema)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return listSourceViews(db, data)
  })

export const getSource = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(sourceIdInput)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return readSourceDetail(db, data.sourceId)
  })

export const registerSource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(registerUrlInputSchema)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return registerUrlSource(db, data, env.INGEST_WORKFLOW)
  })

export const retrySource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(retrySourceInputSchema)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return retrySourceIngest(db, data.sourceId, env.INGEST_WORKFLOW)
  })

export const summarizeSource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(sourceIdInput)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return summarizeSourceBody(db, data.sourceId, env.INGEST_WORKFLOW)
  })

export const askSource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      sourceId: z.string().min(1),
      question: z.string().min(1).max(4000),
    }),
  )
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return askSourceQuestion(db, data.sourceId, data.question, env.INGEST_WORKFLOW)
  })

export const deleteSourceQaAnswer = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(
    z.object({
      sourceId: z.string().min(1),
      qaAnswerId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return deleteQaAnswer(db, data)
  })

export const deleteRegisteredSource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(sourceIdInput)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return deleteSource(db, data.sourceId, workerAssets(env.ASSETS))
  })

export const pasteSource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(pasteSourceInputSchema)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return pasteSourceBody(db, data)
  })

export const registerPdf = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(parseRegisterPdfForm)
  .handler(async ({ data }) => {
    const bytes = new Uint8Array(await data.file.arrayBuffer())
    const upload = parsePdfUpload({ bytes, filename: data.file.name })
    const db = createDb(env.DB)
    return registerPdfSource(db, workerAssets(env.ASSETS), upload, extractPdfTextWithUnpdf, data.notebookId)
  })
