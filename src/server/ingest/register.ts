import { desc, eq } from 'drizzle-orm'
import { jobs, notebooks, sources } from '~/db/schema'
import type { AppDb } from '~/db/types'
import { parseAndNormalizeUrl } from '~/domain/url'
import { assertTransition, sanitizeErrorMessage } from '~/domain/jobs'
import { startIngestWorkflow, type WorkflowBinding } from '~/server/ingest/start-workflow'

export const DEFAULT_NOTEBOOK_TITLE = '受信箱'

export type RegisterResult = {
  sourceId: string
  jobId: string
  duplicate: boolean
}

function nowMs(): number {
  return Date.now()
}

export async function ensureDefaultNotebook(db: AppDb): Promise<string> {
  const existing = await db.select().from(notebooks).where(eq(notebooks.title, DEFAULT_NOTEBOOK_TITLE)).limit(1)
  const row = existing[0]
  if (row) return row.id
  const id = crypto.randomUUID()
  const ts = nowMs()
  await db.insert(notebooks).values({
    id,
    title: DEFAULT_NOTEBOOK_TITLE,
    createdAt: ts,
    updatedAt: ts,
  })
  return id
}

export async function latestJobForSource(db: AppDb, sourceId: string) {
  const rows = await db
    .select()
    .from(jobs)
    .where(eq(jobs.sourceId, sourceId))
    .orderBy(desc(jobs.createdAt))
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
    const queued = await enqueueJob(db, existing.id, normalized, workflow)
    return { ...queued, duplicate: true }
  }

  const notebookId = await ensureDefaultNotebook(db)
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
    r2Key: null,
    createdAt: ts,
    updatedAt: ts,
  })

  const queued = await enqueueJob(db, sourceId, normalized, workflow)
  return { ...queued, duplicate: false }
}

async function enqueueJob(
  db: AppDb,
  sourceId: string,
  normalizedUrl: string,
  workflow: WorkflowBinding | undefined,
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
    attemptCount: 0,
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
