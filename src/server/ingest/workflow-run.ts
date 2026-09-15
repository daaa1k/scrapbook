import { Effect } from 'effect'
import { eq } from 'drizzle-orm'
import { cursorRuns, jobs, sources } from '~/db/schema'
import type { AppDb } from '~/db/types'
import { parseIngestResultJson, sha256Hex } from '~/domain/ingest-result'
import {
  assertTransitionEffect,
  IllegalJobTransitionError,
  jobStatusSchema,
  sanitizeErrorMessage,
  type JobStatus,
} from '~/domain/jobs'
import { runPromiseFail } from '~/lib/effect-run'
import {
  createCursorClient,
  createMockCursorClient,
  ingestPromptForUrl,
  CursorNotConfigured,
  type CursorClient,
  type CursorFailure,
} from '~/server/cursor/client'
import { FAILED_CURSOR_RUN_STATUSES } from '~/server/cursor/schemas'
import { isInsecureAuthBypassEnabled } from '~/server/auth/access'
import { ingestWorkflowParamsSchema, type IngestWorkflowParams } from '~/server/ingest/start-workflow'

export type IngestStep = {
  do: <T>(name: string, callback: () => Promise<T>) => Promise<T>
  sleep: (name: string, duration: string | number) => Promise<void>
}

export type IngestRunEnv = {
  ENVIRONMENT?: string
  ALLOW_INSECURE_AUTH_BYPASS?: string
  CURSOR_API_KEY?: string
}

export type IngestRunOptions = {
  params: IngestWorkflowParams
  db: AppDb
  step: IngestStep
  cursor?: CursorClient
  env?: IngestRunEnv
  fetchImpl?: typeof fetch
  maxPolls?: number
  pollSleep?: string | number
  now?: () => number
}

async function loadJob(db: AppDb, jobId: string) {
  const rows = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)
  const job = rows[0]
  if (!job) throw new Error('job_not_found')
  return job
}

async function transitionJob(
  db: AppDb,
  jobId: string,
  to: JobStatus,
  patch: Partial<typeof jobs.$inferInsert> = {},
  now: number,
): Promise<void> {
  const job = await loadJob(db, jobId)
  const from = jobStatusSchema.parse(job.status)
  await runPromiseFail(assertTransitionEffect(from, to))
  await db
    .update(jobs)
    .set({
      status: to,
      updatedAt: now,
      ...patch,
    })
    .where(eq(jobs.id, jobId))
}

async function failJob(
  db: AppDb,
  jobId: string,
  errorCode: string,
  errorMessage: string,
  now: number,
): Promise<void> {
  const job = await loadJob(db, jobId)
  const from = jobStatusSchema.parse(job.status)
  if (from !== 'failed') {
    await runPromiseFail(assertTransitionEffect(from, 'failed'))
  }
  await db
    .update(jobs)
    .set({
      status: 'failed',
      errorCode,
      errorMessage: sanitizeErrorMessage(errorMessage),
      finishedAt: now,
      updatedAt: now,
    })
    .where(eq(jobs.id, jobId))
}

function resolveCursor(options: IngestRunOptions): Effect.Effect<CursorClient, CursorNotConfigured> {
  if (options.cursor) return Effect.succeed(options.cursor)
  const key = options.env?.CURSOR_API_KEY ?? ''
  if (!key) {
    if (options.env && isInsecureAuthBypassEnabled(options.env)) {
      return Effect.succeed(createMockCursorClient())
    }
    return Effect.fail(new CursorNotConfigured({ message: 'CURSOR_API_KEY is not configured' }))
  }
  return Effect.succeed(createCursorClient({ apiKey: key, fetch: options.fetchImpl }))
}

function runCursor<A>(effect: Effect.Effect<A, CursorFailure>): Promise<A> {
  return runPromiseFail(effect)
}

export async function runIngestWorkflow(options: IngestRunOptions): Promise<void> {
  const params = ingestWorkflowParamsSchema.parse(options.params)
  const db = options.db
  const step = options.step
  const now = options.now ?? Date.now
  const maxPolls = options.maxPolls ?? 20
  const pollSleep = options.pollSleep ?? '15 seconds'

  try {
    await step.do('queued-to-starting', async () => {
      await transitionJob(db, params.jobId, 'starting_agent', { startedAt: now() }, now())
    })

    const created = await step.do('create-cursor-agent', async () => {
      return runCursor(
        Effect.gen(function* () {
          const cursor = yield* resolveCursor(options)
          return yield* cursor.createAgent(ingestPromptForUrl(params.url))
        }),
      )
    })

    await step.do('save-cursor-ids', async () => {
      const ts = now()
      await db
        .update(jobs)
        .set({
          cursorAgentId: created.agent.id,
          updatedAt: ts,
        })
        .where(eq(jobs.id, params.jobId))
      await db.insert(cursorRuns).values({
        id: crypto.randomUUID(),
        jobId: params.jobId,
        agentId: created.agent.id,
        runId: created.run.id,
        status: created.run.status,
        createdAt: ts,
        updatedAt: ts,
      })
    })

    await step.do('starting-to-waiting', async () => {
      await transitionJob(db, params.jobId, 'waiting_agent', {}, now())
    })

    let terminal = created.run
    for (let i = 0; i < maxPolls; i += 1) {
      await step.sleep(`poll-sleep-${i}`, pollSleep)
      terminal = await step.do(`poll-run-${i}`, async () => {
        const run = await runCursor(
          Effect.gen(function* () {
            const cursor = yield* resolveCursor(options)
            return yield* cursor.getRun(created.agent.id, created.run.id)
          }),
        )
        const ts = now()
        await db
          .update(cursorRuns)
          .set({ status: run.status, updatedAt: ts })
          .where(eq(cursorRuns.runId, run.id))
        if (run.status !== 'FINISHED' && !FAILED_CURSOR_RUN_STATUSES.has(run.status)) {
          await transitionJob(db, params.jobId, 'waiting_agent', {}, ts)
        }
        return run
      })
      if (terminal.status === 'FINISHED' || FAILED_CURSOR_RUN_STATUSES.has(terminal.status)) {
        break
      }
    }

    if (terminal.status !== 'FINISHED') {
      const code = FAILED_CURSOR_RUN_STATUSES.has(terminal.status) ? 'cursor_run_failed' : 'timeout'
      await step.do('fail-run', async () => {
        await failJob(db, params.jobId, code, `Cursor run ended: ${terminal.status}`, now())
      })
      return
    }

    await step.do('waiting-to-persisting', async () => {
      await transitionJob(db, params.jobId, 'persisting', {}, now())
    })

    await step.do('persist-source', async () => {
      const parsed = parseIngestResultJson(terminal.result ?? '')
      const ts = now()
      const hash = parsed.body ? await sha256Hex(parsed.body) : null
      let publishedAt: number | null = null
      if (parsed.publishedAt) {
        const ms = Date.parse(parsed.publishedAt)
        publishedAt = Number.isNaN(ms) ? null : ms
      }
      await db
        .update(sources)
        .set({
          title: parsed.title,
          author: parsed.author,
          publishedAt,
          body: parsed.body,
          summary: parsed.summary,
          contentHash: hash,
          fetchStatus: parsed.fetchStatus,
          fetchedAt: ts,
          updatedAt: ts,
        })
        .where(eq(sources.id, params.sourceId))
    })

    await step.do('persisting-to-succeeded', async () => {
      await transitionJob(db, params.jobId, 'succeeded', { finishedAt: now() }, now())
    })
  } catch (error) {
    if (error instanceof CursorNotConfigured) {
      await failJob(db, params.jobId, 'cursor_not_configured', error.message, now())
      return
    }
    const message = error instanceof Error ? error.message : 'ingest_failed'
    try {
      await failJob(db, params.jobId, 'ingest_failed', message, now())
    } catch (failError) {
      if (!(failError instanceof IllegalJobTransitionError)) throw failError
    }
  }
}

export function createImmediateStep(): IngestStep {
  return {
    do: async (_name, callback) => callback(),
    sleep: async () => {},
  }
}
