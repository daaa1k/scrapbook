import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { jobs, sources } from '../src/db/schema'
import { MOCK_INGEST_JSON, createMockCursorClient } from '../src/server/cursor/client'
import { registerUrlSource } from '../src/server/ingest/register'
import { createImmediateStep, runIngestWorkflow } from '../src/server/ingest/workflow-run'
import { createTestDb } from './helpers/db'

describe('ingest workflow', () => {
  it('persists body/summary and marks the job succeeded on FINISHED JSON', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/ok' }, {
      create: async () => ({ id: 'wf' }),
    })

    await runIngestWorkflow({
      params: { jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/ok' },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient(),
      maxPolls: 2,
      pollSleep: 0,
    })

    const source = (await db.select().from(sources).where(eq(sources.id, registered.sourceId)))[0]
    const job = (await db.select().from(jobs).where(eq(jobs.id, registered.jobId)))[0]
    expect(job?.status).toBe('succeeded')
    expect(source?.title).toBe(MOCK_INGEST_JSON.title)
    expect(source?.summary).toBe(MOCK_INGEST_JSON.summary)
    expect(source?.body).toBe(MOCK_INGEST_JSON.body)
    expect(source?.fetchStatus).toBe('full')
    expect(source?.acquiredVia).toBe('fetch')
    expect(source?.contentHash).toBeTruthy()
  })

  it('fails the job with a UI-facing error and does not require a body', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/fail' }, {
      create: async () => ({ id: 'wf' }),
    })

    await runIngestWorkflow({
      params: { jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/fail' },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({ runStatus: 'ERROR' }),
      maxPolls: 2,
      pollSleep: 0,
    })

    const source = (await db.select().from(sources).where(eq(sources.id, registered.sourceId)))[0]
    const job = (await db.select().from(jobs).where(eq(jobs.id, registered.jobId)))[0]
    expect(job?.status).toBe('failed')
    expect(job?.errorCode).toBe('cursor_run_failed')
    expect(job?.errorMessage).toBeTruthy()
    expect(source?.body).toBeNull()
  })

  it('fails with cursor_not_configured when production has no key', async () => {
    const { db } = createTestDb()
    const registered = await registerUrlSource(db, { url: 'https://example.com/nokey' }, {
      create: async () => ({ id: 'wf' }),
    })

    await runIngestWorkflow({
      params: { jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/nokey' },
      db,
      step: createImmediateStep(),
      env: {
        ENVIRONMENT: 'production',
        ALLOW_INSECURE_AUTH_BYPASS: 'true',
        CURSOR_API_KEY: '',
      },
      maxPolls: 1,
      pollSleep: 0,
    })

    const job = (await db.select().from(jobs).where(eq(jobs.id, registered.jobId)))[0]
    expect(job?.status).toBe('failed')
    expect(job?.errorCode).toBe('cursor_not_configured')
  })
})
