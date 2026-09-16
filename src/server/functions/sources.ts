import { eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { createDb } from '~/db/client'
import { sources } from '~/db/schema'
import { acquiredViaSchema, listSourcesInputSchema, pasteSourceInputSchema, registerUrlInputSchema, retrySourceInputSchema } from '~/domain/url'
import { jobStatusSchema, type JobStatus } from '~/domain/jobs'
import { authMiddleware } from '~/server/auth/middleware'
import {
  latestJobForSource,
  pasteSourceBody,
  registerUrlSource,
  retrySourceIngest,
} from '~/server/ingest/register'
import { findSourcesByQuery } from '~/server/ingest/search'

const sourceIdInput = z.object({
  sourceId: z.string().min(1),
})

export const sourceListItemSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  kind: z.string(),
  fetchStatus: z.string(),
  acquiredVia: acquiredViaSchema,
  jobStatus: jobStatusSchema.nullable(),
  createdAt: z.number(),
})

export const sourceDetailSchema = z.object({
  id: z.string(),
  kind: z.string(),
  url: z.string().nullable(),
  title: z.string().nullable(),
  author: z.string().nullable(),
  fetchStatus: z.string(),
  acquiredVia: acquiredViaSchema,
  summary: z.string().nullable(),
  body: z.string().nullable(),
  job: z
    .object({
      id: z.string(),
      status: jobStatusSchema,
      errorCode: z.string().nullable(),
      errorMessage: z.string().nullable(),
    })
    .nullable(),
})

export const listSources = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(listSourcesInputSchema)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    const rows = await findSourcesByQuery(db, data.q ?? '')
    const items = []
    for (const row of rows) {
      const job = await latestJobForSource(db, row.id)
      items.push(
        sourceListItemSchema.parse({
          id: row.id,
          title: row.title,
          url: row.url,
          kind: row.kind,
          fetchStatus: row.fetchStatus,
          acquiredVia: row.acquiredVia,
          jobStatus: job ? jobStatusSchema.parse(job.status) : null,
          createdAt: row.createdAt,
        }),
      )
    }
    return items
  })

export const getSource = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator(sourceIdInput)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    const rows = await db.select().from(sources).where(eq(sources.id, data.sourceId)).limit(1)
    const row = rows[0]
    if (!row) {
      throw new Error('source_not_found')
    }
    const job = await latestJobForSource(db, row.id)
    return sourceDetailSchema.parse({
      id: row.id,
      kind: row.kind,
      url: row.url,
      title: row.title,
      author: row.author,
      fetchStatus: row.fetchStatus,
      acquiredVia: row.acquiredVia,
      summary: row.summary,
      body: row.body,
      job: job
        ? {
            id: job.id,
            status: jobStatusSchema.parse(job.status) as JobStatus,
            errorCode: job.errorCode,
            errorMessage: job.errorMessage,
          }
        : null,
    })
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

export const pasteSource = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(pasteSourceInputSchema)
  .handler(async ({ data }) => {
    const db = createDb(env.DB)
    return pasteSourceBody(db, data)
  })

export const stubPdfUpload = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async () => {
    const key = 'pdfs/stub.txt'
    await env.ASSETS.put(key, 'stub')
    return { key }
  })
