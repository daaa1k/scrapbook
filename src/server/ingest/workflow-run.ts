import { Effect } from 'effect'
import { eq } from 'drizzle-orm'
import { citations as citationsTable, cursorRuns, jobs, qaAnswers, qaCitations, sources } from '~/db/schema'
import type { AppDb } from '~/db/types'
import { encodeLocator, type Citation } from '~/domain/citations'
import {
  parseAskResultJson,
  parseIngestResultJson,
  parseSummarizeResultJson,
  sha256Hex,
  storedBodyText,
} from '~/domain/ingest-result'
import {
  assertTransitionEffect,
  IllegalJobTransitionError,
  jobStatusSchema,
  sanitizeErrorMessage,
  type JobStatus,
} from '~/domain/jobs'
import { runPromiseFail } from '~/lib/effect-run'
import {
  askPromptForBody,
  createCursorClient,
  createMockCursorClient,
  ingestPromptForUrl,
  summarizePromptForBody,
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

async function promptForJob(db: AppDb, params: IngestWorkflowParams): Promise<string> {
  switch (params.mode) {
    case 'fetch':
      return ingestPromptForUrl(params.url)
    case 'summarize_body': {
      const rows = await db.select({ body: sources.body }).from(sources).where(eq(sources.id, params.sourceId)).limit(1)
      const body = storedBodyText(rows[0]?.body)
      if (!body) throw new Error('source_has_no_body')
      return summarizePromptForBody(body)
    }
    case 'ask_source': {
      const [sourceRows, answerRows] = await Promise.all([
        db.select({ body: sources.body }).from(sources).where(eq(sources.id, params.sourceId)).limit(1),
        db.select({ question: qaAnswers.question }).from(qaAnswers).where(eq(qaAnswers.id, params.qaAnswerId)).limit(1),
      ])
      const body = storedBodyText(sourceRows[0]?.body)
      if (!body) throw new Error('source_has_no_body')
      const question = answerRows[0]?.question?.trim() ?? ''
      if (!question) throw new Error('question_empty')
      return askPromptForBody(question, body)
    }
  }
}

async function replaceSourceCitations(
  db: AppDb,
  sourceId: string,
  citations: readonly Citation[],
  ts: number,
): Promise<void> {
  await db.delete(citationsTable).where(eq(citationsTable.sourceId, sourceId))
  if (citations.length === 0) return
  await db.insert(citationsTable).values(
    citations.map((citation) => ({
      id: crypto.randomUUID(),
      sourceId,
      locator: encodeLocator(citation.locator),
      excerpt: citation.excerpt,
      createdAt: ts,
    })),
  )
}

async function replaceQaCitations(
  db: AppDb,
  qaAnswerId: string,
  citations: readonly Citation[],
  ts: number,
): Promise<void> {
  await db.delete(qaCitations).where(eq(qaCitations.qaAnswerId, qaAnswerId))
  if (citations.length === 0) return
  await db.insert(qaCitations).values(
    citations.map((citation) => ({
      id: crypto.randomUUID(),
      qaAnswerId,
      locator: encodeLocator(citation.locator),
      excerpt: citation.excerpt,
      createdAt: ts,
    })),
  )
}

async function persistIngestOutput(
  db: AppDb,
  params: IngestWorkflowParams,
  raw: string,
  ts: number,
): Promise<void> {
  switch (params.mode) {
    case 'fetch': {
      const parsed = parseIngestResultJson(raw)
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
          acquiredVia: 'fetch',
          fetchedAt: ts,
          updatedAt: ts,
        })
        .where(eq(sources.id, params.sourceId))
      await replaceSourceCitations(db, params.sourceId, parsed.citations, ts)
      return
    }
    case 'summarize_body': {
      const parsed = parseSummarizeResultJson(raw)
      await db
        .update(sources)
        .set({
          summary: parsed.summary,
          updatedAt: ts,
        })
        .where(eq(sources.id, params.sourceId))
      await replaceSourceCitations(db, params.sourceId, parsed.citations, ts)
      return
    }
    case 'ask_source': {
      const parsed = parseAskResultJson(raw)
      await db
        .update(qaAnswers)
        .set({
          answer: parsed.answer,
          updatedAt: ts,
        })
        .where(eq(qaAnswers.id, params.qaAnswerId))
      await replaceQaCitations(db, params.qaAnswerId, parsed.citations, ts)
      return
    }
  }
}

function failCodeForError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'ingest_failed'
  if (
    message === 'source_has_no_body' ||
    message === 'ingest_result_not_json' ||
    message === 'question_empty'
  ) {
    return message
  }
  return 'ingest_failed'
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
      const prompt = await promptForJob(db, params)
      return runCursor(
        Effect.gen(function* () {
          const cursor = yield* resolveCursor(options)
          return yield* cursor.createAgent(prompt)
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
      await persistIngestOutput(db, params, terminal.result ?? '', now())
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
      await failJob(db, params.jobId, failCodeForError(error), message, now())
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
