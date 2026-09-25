import { and, desc, eq, sql } from 'drizzle-orm'
import { jobs, notebooks, qaAnswers, sources } from '~/db/schema'
import type { AppDb } from '~/db/types'
import { insertAskJobAndAnswer } from '~/db/atomic-ask'
import { deleteNotebookRows, deleteSourceRows } from '~/db/atomic-delete'
import { sha256Hex, storedBodyText } from '~/domain/ingest-result'
import { assertTransition, canStartCursorJob, isTerminalJobStatus, jobKindSchema, jobStatusSchema, sanitizeErrorMessage } from '~/domain/jobs'
import { parseAndNormalizeUrl, type PasteSourceInput } from '~/domain/url'
import { notebookIdSchema, type NotebookId, type NotebookTarget } from '~/domain/organization'
import { startIngestWorkflow, type WorkflowBinding } from '~/server/ingest/start-workflow'
import { fetchUrlPageTitle } from '~/server/ingest/page-title'
import type { AssetsPort, R2ObjectKey } from '~/server/ingest/pdf'
import { applyFirstSourceNotebookTitle, withNotebookTarget } from '~/server/organization'
import { isUniqueConstraintError } from '~/lib/sqlite-errors'

export type RegisterResult = {
  sourceId: string
  notebookId: NotebookId
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
  notebookId: NotebookId
}

function nowMs(): number {
  return Date.now()
}

function reuseOrRejectDuplicate(existingNotebookId: string, target: NotebookTarget): void {
  if (target !== 'new' && existingNotebookId === target) return
  throw new Error('source_already_registered')
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

async function sourceByNormalizedUrl(db: AppDb, normalized: string) {
  const rows = await db.select().from(sources).where(eq(sources.normalizedUrl, normalized)).limit(1)
  return rows[0] ?? null
}

function isUniqueColumnConflict(error: unknown, column: string): boolean {
  let current: unknown = error
  const message = `UNIQUE constraint failed: ${column}`
  while (current instanceof Error) {
    if (current.message === message || current.message.startsWith(`${message}: SQLITE_CONSTRAINT`)) return true
    current = current.cause
  }
  return false
}

export type RegisterFetchOptions = {
  fetchImpl?: typeof fetch
}

export async function registerUrlSource(
  db: AppDb,
  input: { url: string; notebook: NotebookTarget },
  workflow: WorkflowBinding | undefined,
  options?: RegisterFetchOptions,
): Promise<RegisterResult> {
  const { original, normalized, kind } = parseAndNormalizeUrl(input.url)
  const existing = await sourceByNormalizedUrl(db, normalized)
  if (existing) {
    return reuseExistingUrlSource(db, existing, input.notebook, normalized, workflow)
  }

  const hostname = new URL(normalized).hostname
  const pageTitle = await fetchUrlPageTitle(normalized, { fetchImpl: options?.fetchImpl })
  const titleHint = pageTitle ?? hostname

  const sourceConflict = new Error('source_normalized_url_conflict')
  try {
    return await withNotebookTarget(db, input.notebook, titleHint, async (notebookId) => {
      const sourceId = crypto.randomUUID()
      const ts = nowMs()

      try {
        await db.insert(sources).values({
          id: sourceId,
          notebookId,
          kind,
          url: original,
          normalizedUrl: normalized,
          title: pageTitle,
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
      } catch (error) {
        if (!isUniqueColumnConflict(error, 'sources.normalized_url')) throw error
        throw sourceConflict
      }

      if (input.notebook !== 'new') {
        await applyFirstSourceNotebookTitle(db, notebookId, titleHint)
      }

      const jobId = await enqueueOrReuseFetchJob(db, workflow, sourceId, normalized)
      return { sourceId, jobId, notebookId, duplicate: false }
    })
  } catch (error) {
    if (error !== sourceConflict) throw error
    const winner = await sourceByNormalizedUrl(db, normalized)
    if (!winner) throw error
    return reuseExistingUrlSource(db, winner, input.notebook, normalized, workflow)
  }
}

async function reuseExistingUrlSource(
  db: AppDb,
  existing: typeof sources.$inferSelect,
  target: NotebookTarget,
  normalized: string,
  workflow: WorkflowBinding | undefined,
): Promise<RegisterResult> {
  reuseOrRejectDuplicate(existing.notebookId, target)
  const notebookId = notebookIdSchema.parse(existing.notebookId)
  const latest = await latestJobForSource(db, existing.id)
  if (latest) return { sourceId: existing.id, notebookId, jobId: latest.id, duplicate: true }

  const jobId = await enqueueOrReuseFetchJob(db, workflow, existing.id, normalized)
  return { sourceId: existing.id, notebookId, jobId, duplicate: true }
}

async function enqueueOrReuseFetchJob(
  db: AppDb,
  workflow: WorkflowBinding | undefined,
  sourceId: string,
  normalized: string,
): Promise<string> {
  try {
    const queued = await enqueueJob(db, workflow, 0, {
      mode: 'fetch', sourceId, url: normalized,
    })
    return queued.jobId
  } catch (error) {
    if (!isUniqueColumnConflict(error, 'jobs.source_id')) throw error
    const winner = await latestJobForSource(db, sourceId)
    if (!winner) throw error
    return winner.id
  }
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
  return startOrReuseJob(db, sourceId, workflow, {
    mode: 'fetch',
    url: source.normalizedUrl,
  })
}

export async function summarizeSourceBody(
  db: AppDb,
  sourceId: string,
  workflow: WorkflowBinding | undefined,
): Promise<RetryResult> {
  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) {
    throw new Error('source_not_found')
  }
  if (!storedBodyText(source.body)) {
    throw new Error('source_has_no_body')
  }
  return startOrReuseJob(db, sourceId, workflow, { mode: 'summarize_body' })
}

export async function askSourceQuestion(
  db: AppDb,
  sourceId: string,
  question: string,
  workflow: WorkflowBinding | undefined,
): Promise<RetryResult> {
  const trimmed = question.trim()
  if (!trimmed) {
    throw new Error('question_empty')
  }
  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) {
    throw new Error('source_not_found')
  }
  if (!storedBodyText(source.body)) {
    throw new Error('source_has_no_body')
  }
  return startOrReuseJob(db, sourceId, workflow, { mode: 'ask_source', question: trimmed })
}

export async function deleteQaAnswer(
  db: AppDb,
  input: { sourceId: string; qaAnswerId: string },
): Promise<{ deleted: true }> {
  const rows = await db.select().from(qaAnswers).where(eq(qaAnswers.id, input.qaAnswerId)).limit(1)
  const row = rows[0]
  if (!row || row.sourceId !== input.sourceId) {
    throw new Error('qa_answer_not_found')
  }
  const jobRows = await db.select().from(jobs).where(eq(jobs.id, row.jobId)).limit(1)
  const job = jobRows[0]
  if (!job) {
    throw new Error('qa_answer_not_found')
  }
  if (!isTerminalJobStatus(jobStatusSchema.parse(job.status))) {
    throw new Error('qa_answer_in_progress')
  }
  await db.delete(qaAnswers).where(eq(qaAnswers.id, input.qaAnswerId))
  return { deleted: true }
}

export async function deleteSource(
  db: AppDb,
  sourceId: string,
  assets: AssetsPort | undefined,
): Promise<{ deleted: true }> {
  const rows = await db.select().from(sources).where(eq(sources.id, sourceId)).limit(1)
  const source = rows[0]
  if (!source) {
    throw new Error('source_not_found')
  }
  const latest = await latestJobForSource(db, sourceId)
  const latestStatus = latest ? jobStatusSchema.parse(latest.status) : null
  if (!canStartCursorJob(latestStatus)) {
    throw new Error('source_in_progress')
  }

  if (!await deleteSourceRows(db, sourceId, source.notebookId, nowMs())) {
    throw new Error('source_in_progress')
  }

  if (source.r2Key && assets) {
    try {
      await assets.delete(source.r2Key as R2ObjectKey)
    } catch {
      // Best-effort: D1 row is already gone.
    }
  }

  return { deleted: true }
}

export async function deleteNotebookWithSources(
  db: AppDb,
  notebookId: NotebookId,
  assets: AssetsPort | undefined,
): Promise<{ deleted: true }> {
  const rows = await db.select({ id: notebooks.id }).from(notebooks).where(eq(notebooks.id, notebookId)).limit(1)
  if (!rows[0]) return { deleted: true }
  const result = await deleteNotebookRows(db, notebookId)
  if (!result.deleted) {
    throw new Error('notebook_in_progress')
  }
  if (assets) {
    for (const key of result.r2Keys) {
      try {
        await assets.delete(key as R2ObjectKey)
      } catch {
        // Best-effort: D1 rows are already gone.
      }
    }
  }
  return { deleted: true }
}

type EnqueueParams =
  | { mode: 'fetch'; sourceId: string; url: string }
  | { mode: 'summarize_body'; sourceId: string }
  | { mode: 'ask_source'; sourceId: string; question: string }

type JobStartParams =
  | { mode: 'fetch'; url: string }
  | { mode: 'summarize_body' }
  | { mode: 'ask_source'; question: string }

async function startOrReuseJob(
  db: AppDb,
  sourceId: string,
  workflow: WorkflowBinding | undefined,
  params: JobStartParams,
): Promise<RetryResult> {
  const latest = await latestJobForSource(db, sourceId)
  const latestStatus = latest ? jobStatusSchema.parse(latest.status) : null
  if (!canStartCursorJob(latestStatus)) {
    return { sourceId, jobId: latest!.id, started: false }
  }
  const attemptCount = (latest?.attemptCount ?? 0) + 1
  try {
    const queued = await enqueueJob(db, workflow, attemptCount, { ...params, sourceId })
    return { ...queued, started: true }
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
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
  notebookId: NotebookId,
  input: { title: string; body: string },
  ts: number,
  hash: string,
): Promise<PasteResult> {
  await assertSourceIdle(db, sourceId)
  const updated = await db
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
    .where(and(
      eq(sources.id, sourceId),
      sql`not exists (
        select 1 from jobs as active_jobs
        where active_jobs.source_id = ${sourceId}
          and active_jobs.status not in ('succeeded', 'failed')
      )`,
    ))
    .returning({ id: sources.id })
  if (updated.length === 0) {
    const stillExists = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, sourceId)).limit(1)
    throw new Error(stillExists.length ? 'job_in_progress' : 'source_not_found')
  }
  return { sourceId, notebookId }
}

export async function pasteSourceBody(db: AppDb, input: PasteSourceInput): Promise<PasteResult> {
  const ts = nowMs()
  const hash = await sha256Hex(input.body)
  const urlInput = input.url?.trim()
  const parsed = urlInput ? parseAndNormalizeUrl(urlInput) : null

  if ('sourceId' in input) {
    const rows = await db.select().from(sources).where(eq(sources.id, input.sourceId)).limit(1)
    const row = rows[0]
    if (!row) throw new Error('source_not_found')
    return writePastedBody(db, row.id, notebookIdSchema.parse(row.notebookId), input, ts, hash)
  }

  if (parsed) {
    const existing = await sourceByNormalizedUrl(db, parsed.normalized)
    if (existing) {
      reuseOrRejectDuplicate(existing.notebookId, input.notebook)
      return writePastedBody(
        db,
        existing.id,
        notebookIdSchema.parse(existing.notebookId),
        input,
        ts,
        hash,
      )
    }
  }

  return withNotebookTarget(db, input.notebook, input.title, async (notebookId) => {
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
    if (input.notebook !== 'new') {
      await applyFirstSourceNotebookTitle(db, notebookId, input.title)
    }
    return { sourceId, notebookId }
  })
}

async function enqueueJob(
  db: AppDb,
  workflow: WorkflowBinding | undefined,
  attemptCount: number,
  params: EnqueueParams,
): Promise<{ sourceId: string; jobId: string }> {
  const jobId = crypto.randomUUID()
  const ts = nowMs()
  const kind = jobKindSchema.parse(params.mode)
  const job = {
    id: jobId,
    sourceId: params.sourceId,
    kind,
    status: 'queued',
    cursorAgentId: null,
    errorCode: null,
    errorMessage: null,
    attemptCount,
    createdAt: ts,
    updatedAt: ts,
    startedAt: null,
    finishedAt: null,
  }

  let workflowParams:
    | { mode: 'fetch'; jobId: string; sourceId: string; url: string }
    | { mode: 'summarize_body'; jobId: string; sourceId: string }
    | { mode: 'ask_source'; jobId: string; sourceId: string; qaAnswerId: string }

  if (params.mode === 'fetch') {
    await db.insert(jobs).values(job)
    workflowParams = { mode: 'fetch', jobId, sourceId: params.sourceId, url: params.url }
  } else if (params.mode === 'summarize_body') {
    await db.insert(jobs).values(job)
    workflowParams = { mode: 'summarize_body', jobId, sourceId: params.sourceId }
  } else {
    const qaAnswerId = crypto.randomUUID()
    await insertAskJobAndAnswer(db, job, {
      id: qaAnswerId,
      sourceId: params.sourceId,
      jobId,
      question: params.question,
      answer: null,
      createdAt: ts,
      updatedAt: ts,
    })
    workflowParams = {
      mode: 'ask_source',
      jobId,
      sourceId: params.sourceId,
      qaAnswerId,
    }
  }

  try {
    await startIngestWorkflow(workflow, workflowParams)
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

  return { sourceId: params.sourceId, jobId }
}
