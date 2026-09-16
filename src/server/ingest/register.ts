import { desc, eq, sql } from 'drizzle-orm'
import { jobs, sources } from '~/db/schema'
import type { AppDb } from '~/db/types'
import { sha256Hex } from '~/domain/ingest-result'
import { assertTransition, canStartCursorJob, jobStatusSchema, sanitizeErrorMessage } from '~/domain/jobs'
import { parseAndNormalizeUrl } from '~/domain/url'
import { ensureInboxNotebook } from '~/server/organization'
import { startIngestWorkflow, type WorkflowBinding } from '~/server/ingest/start-workflow'

export type RegisterResult = {
  sourceId: string
  jobId: string
  duplicate: boolean
}

export type RetryResult = {
  sourceId: string
  jobId: string
  started: boolean
}

export type PasteResult = {
  sourceId: string
}

function nowMs(): number {
  return Date.now()
}

function isActiveJobUniqueError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed/i.test(message)
}

export async function latestJobForSource(db: AppDb, sourceId: string) {
  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.sourceId, sourceId))
    .orderBy(desc(jobs.createdAt), desc(sql`rowid`))
    .limit(1)
  return rows[0] ?? null
}

export async function registerUrlSource(
  db: AppDb,
  input: { url: string },
  workflow: WorkflowBinding | undefined,
): Promise<RegisterResult> {
  const { original, normalized, kind } = parseAndNormalizeUrl(input.url)
  const duplicates = await db.select().from(sources).where(eq(sources.normalizedUrl, normalized)).limit(1)
  const existing = duplicates[0]
  if (existing) {
    const latest = await latestJobForSource(db, existing.id)
    if (latest) {
      return { sourceId: existing.id, jobId: latest.id, duplicate: true }
    }
    const queued = await enqueueJob(db, existing.id, normalized, workflow, 0)
    return { ...queued, duplicate: true }
  }

  const notebookId = await ensureInboxNotebook(db)
  const sourceId = crypto.randomUUID()
  const ts = nowMs()

  await db.insert(sources).values({
    id: sourceId,
    notebookId,
    kind,
    url: original,
    normalizedUrl: normalized,
    title: null,
    author: null,
    publishedAt: null,
    fetchedAt: null,
    body: null,
    summary: null,
    contentHash: null,
    fetchStatus: 'none',
    acquiredVia: 'fetch',
    r2Key: null,
    createdAt: ts,
    updatedAt: ts,
  })

  const queued = await enqueueJob(db, sourceId, normalized, workflow, 0)
  return { ...queued, duplicate: false }
}

export async function retrySourceIngest(
  db: AppDb,
  sourceId: string,
  workflow: WorkflowBinding | undefined,
): Promise<RetryResult> {
  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) {
    throw new Error('source_not_found')
  }
  if (!source.normalizedUrl) {
    throw new Error('source_has_no_url')
  }

  const latest = await latestJobForSource(db, sourceId)
  const latestStatus = latest ? jobStatusSchema.parse(latest.status) : null
  if (!canStartCursorJob(latestStatus)) {
    return { sourceId, jobId: latest!.id, started: false }
  }

  const attemptCount = (latest?.attemptCount ?? 0) + 1
  try {
    const queued = await enqueueJob(db, sourceId, source.normalizedUrl, workflow, attemptCount)
    return { ...queued, started: true }
  } catch (error) {
    if (!isActiveJobUniqueError(error)) throw error
    const current = await latestJobForSource(db, sourceId)
    if (!current) throw error
    return { sourceId, jobId: current.id, started: false }
  }
}

async function assertSourceIdle(db: AppDb, sourceId: string): Promise<void> {
  const latest = await latestJobForSource(db, sourceId)
  const latestStatus = latest ? jobStatusSchema.parse(latest.status) : null
  if (!canStartCursorJob(latestStatus)) {
    throw new Error('job_in_progress')
  }
}

async function writePastedBody(
  db: AppDb,
  sourceId: string,
  input: { title: string; body: string },
  ts: number,
  hash: string,
): Promise<PasteResult> {
  await assertSourceIdle(db, sourceId)
  await db
    .update(sources)
    .set({
      title: input.title,
      body: input.body,
      summary: null,
      contentHash: hash,
      fetchStatus: 'full',
      acquiredVia: 'paste',
      fetchedAt: ts,
      updatedAt: ts,
    })
    .where(eq(sources.id, sourceId))
  return { sourceId }
}

export async function pasteSourceBody(
  db: AppDb,
  input: { sourceId?: string; title: string; body: string; url?: string },
): Promise<PasteResult> {
  const ts = nowMs()
  const hash = await sha256Hex(input.body)
  const urlInput = input.url?.trim()
  const parsed = urlInput ? parseAndNormalizeUrl(urlInput) : null

  if (input.sourceId) {
    const rows = await db.select().from(sources).where(eq(sources.id, input.sourceId)).limit(1)
    const row = rows[0]
    if (!row) throw new Error('source_not_found')
    return writePastedBody(db, row.id, input, ts, hash)
  }

  if (parsed) {
    const duplicates = await db.select().from(sources).where(eq(sources.normalizedUrl, parsed.normalized)).limit(1)
    const existing = duplicates[0]
    if (existing) {
      return writePastedBody(db, existing.id, input, ts, hash)
    }
  }

  const notebookId = await ensureInboxNotebook(db)
  const sourceId = crypto.randomUUID()
  await db.insert(sources).values({
    id: sourceId,
    notebookId,
    kind: parsed?.kind ?? 'url',
    url: parsed ? parsed.original : null,
    normalizedUrl: parsed?.normalized ?? null,
    title: input.title,
    author: null,
    publishedAt: null,
    fetchedAt: ts,
    body: input.body,
    summary: null,
    contentHash: hash,
    fetchStatus: 'full',
    acquiredVia: 'paste',
    r2Key: null,
    createdAt: ts,
    updatedAt: ts,
  })
  return { sourceId }
}

async function enqueueJob(
  db: AppDb,
  sourceId: string,
  normalizedUrl: string,
  workflow: WorkflowBinding | undefined,
  attemptCount: number,
): Promise<{ sourceId: string; jobId: string }> {
  const jobId = crypto.randomUUID()
  const ts = nowMs()
  await db.insert(jobs).values({
    id: jobId,
    sourceId,
    status: 'queued',
    cursorAgentId: null,
    errorCode: null,
    errorMessage: null,
    attemptCount,
    createdAt: ts,
    updatedAt: ts,
    startedAt: null,
    finishedAt: null,
  })

  try {
    await startIngestWorkflow(workflow, { jobId, sourceId, url: normalizedUrl })
  } catch (error) {
    assertTransition('queued', 'failed')
    const message = sanitizeErrorMessage(error instanceof Error ? error.message : 'workflow_start_failed')
    await db
      .update(jobs)
      .set({
        status: 'failed',
        errorCode: 'workflow_start_failed',
        errorMessage: message,
        finishedAt: nowMs(),
        updatedAt: nowMs(),
      })
      .where(eq(jobs.id, jobId))
  }

  return { sourceId, jobId }
}
