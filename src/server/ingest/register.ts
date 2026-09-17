import { desc, eq, inArray, sql } from 'drizzle-orm'
import { citations, cursorRuns, jobs, notebooks, qaAnswers, sources } from '~/db/schema'
import type { AppDb } from '~/db/types'
import { sha256Hex, storedBodyText } from '~/domain/ingest-result'
import { assertTransition, canStartCursorJob, isTerminalJobStatus, jobKindSchema, jobStatusSchema, sanitizeErrorMessage } from '~/domain/jobs'
import { parseAndNormalizeUrl, type PasteSourceInput } from '~/domain/url'
import { notebookIdSchema, type NotebookId, type NotebookTarget } from '~/domain/organization'
import { startIngestWorkflow, type WorkflowBinding } from '~/server/ingest/start-workflow'
import type { AssetsPort, R2ObjectKey } from '~/server/ingest/pdf'
import { withNotebookTarget } from '~/server/organization'

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

function isActiveJobUniqueError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed/i.test(message)
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

export async function registerUrlSource(
  db: AppDb,
  input: { url: string; notebook: NotebookTarget },
  workflow: WorkflowBinding | undefined,
): Promise<RegisterResult> {
  const { original, normalized, kind } = parseAndNormalizeUrl(input.url)
  const existing = await sourceByNormalizedUrl(db, normalized)
  if (existing) {
    reuseOrRejectDuplicate(existing.notebookId, input.notebook)
    const notebookId = notebookIdSchema.parse(existing.notebookId)
    const latest = await latestJobForSource(db, existing.id)
    if (latest) {
      return { sourceId: existing.id, notebookId, jobId: latest.id, duplicate: true }
    }
    const queued = await enqueueJob(db, workflow, 0, {
      mode: 'fetch',
      sourceId: existing.id,
      url: normalized,
    })
    return { ...queued, notebookId, duplicate: true }
  }

  return withNotebookTarget(db, input.notebook, new URL(normalized).hostname, async (notebookId) => {
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

    const queued = await enqueueJob(db, workflow, 0, {
      mode: 'fetch',
      sourceId,
      url: normalized,
    })
    return { ...queued, notebookId, duplicate: false }
  })
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

  const jobRows = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.sourceId, sourceId))
  const jobIds = jobRows.map((row) => row.id)

  await db.update(notebooks).set({ updatedAt: nowMs() }).where(eq(notebooks.id, source.notebookId))
  await db.delete(qaAnswers).where(eq(qaAnswers.sourceId, sourceId))
  await db.delete(citations).where(eq(citations.sourceId, sourceId))
  if (jobIds.length > 0) {
    await db.delete(cursorRuns).where(inArray(cursorRuns.jobId, jobIds))
    await db.delete(jobs).where(eq(jobs.sourceId, sourceId))
  }
  await db.delete(sources).where(eq(sources.id, sourceId))

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
  const sourceRows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.notebookId, notebookId))
  for (const source of sourceRows) {
    const latest = await latestJobForSource(db, source.id)
    const latestStatus = latest ? jobStatusSchema.parse(latest.status) : null
    if (!canStartCursorJob(latestStatus)) {
      throw new Error('notebook_in_progress')
    }
  }
  for (const source of sourceRows) {
    await deleteSource(db, source.id, assets)
  }
  await db.delete(notebooks).where(eq(notebooks.id, notebookId))
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
  notebookId: NotebookId,
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
  await db.insert(jobs).values({
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
  })

  let workflowParams:
    | { mode: 'fetch'; jobId: string; sourceId: string; url: string }
    | { mode: 'summarize_body'; jobId: string; sourceId: string }
    | { mode: 'ask_source'; jobId: string; sourceId: string; qaAnswerId: string }

  if (params.mode === 'fetch') {
    workflowParams = { mode: 'fetch', jobId, sourceId: params.sourceId, url: params.url }
  } else if (params.mode === 'summarize_body') {
    workflowParams = { mode: 'summarize_body', jobId, sourceId: params.sourceId }
  } else {
    const qaAnswerId = crypto.randomUUID()
    await db.insert(qaAnswers).values({
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
