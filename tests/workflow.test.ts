import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { cursorRuns, jobs, sources } from '../src/db/schema'
import { MAX_SOURCE_BODY_CHARS } from '../src/domain/pdf'
import { organizationCommandSchema } from '../src/domain/organization'
import { MOCK_INGEST_JSON, createMockCursorClient } from '../src/server/cursor/client'
import { registerUrlSource } from '../src/server/ingest/register'
import { applyOrganizationCommand } from '../src/server/organization'
import { createImmediateStep, runIngestWorkflow } from '../src/server/ingest/workflow-run'
import type { IngestStep } from '../src/server/ingest/workflow-run'
import { createTestDb } from './helpers/db'
import { seedNotebook } from './helpers/notebook'

describe('ingest workflow', () => {
  function replayDbSteps(names: readonly string[]): IngestStep {
    return {
      do: async (name, callback) => {
        const result = await callback()
        if (names.includes(name)) await callback()
        return result
      },
      sleep: async () => {},
    }
  }

  it('replays committed DB callbacks without duplicating a run or resetting terminal timestamps', async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    const registered = await registerUrlSource(db, { url: 'https://example.com/replay', notebook }, {
      create: async () => ({ id: 'wf' }),
    })
    let clock = 100
    await runIngestWorkflow({
      params: { mode: 'fetch', jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/replay' },
      db,
      step: replayDbSteps([
        'queued-to-starting', 'save-cursor-ids', 'starting-to-waiting',
        'waiting-to-persisting', 'persisting-to-succeeded',
      ]),
      cursor: createMockCursorClient(),
      maxPolls: 1,
      pollSleep: 0,
      now: () => clock++,
    })

    const job = (await db.select().from(jobs).where(eq(jobs.id, registered.jobId)))[0]
    const runs = await db.select().from(cursorRuns).where(eq(cursorRuns.jobId, registered.jobId))
    expect(job?.status).toBe('succeeded')
    expect(job?.startedAt).toBe(100)
    expect(job?.finishedAt).toBe(112)
    expect(runs).toHaveLength(1)
    expect(runs[0]?.createdAt).toBe(104)
  })

  it('replays fail-run without changing the recorded failure', async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    const registered = await registerUrlSource(db, { url: 'https://example.com/replay-fail', notebook }, {
      create: async () => ({ id: 'wf' }),
    })
    let clock = 100
    await runIngestWorkflow({
      params: { mode: 'fetch', jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/replay-fail' },
      db,
      step: replayDbSteps(['fail-run']),
      cursor: createMockCursorClient({ runStatus: 'ERROR' }),
      maxPolls: 1,
      pollSleep: 0,
      now: () => clock++,
    })
    const job = (await db.select().from(jobs).where(eq(jobs.id, registered.jobId)))[0]
    expect(job?.status).toBe('failed')
    expect(job?.errorCode).toBe('cursor_run_failed')
    expect(job?.finishedAt).toBe(105)
  })

  it('rejects a different failure already recorded before fail-run', async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    const registered = await registerUrlSource(db, { url: 'https://example.com/failed-before-run', notebook }, {
      create: async () => ({ id: 'wf' }),
    })
    const step: IngestStep = {
      do: async (name, callback) => {
        if (name === 'fail-run') {
          await db.update(jobs).set({ status: 'failed', errorCode: 'timeout', errorMessage: 'other failure' })
            .where(eq(jobs.id, registered.jobId))
        }
        return callback()
      },
      sleep: async () => {},
    }
    await expect(runIngestWorkflow({
      params: { mode: 'fetch', jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/failed-before-run' },
      db,
      step,
      cursor: createMockCursorClient({ runStatus: 'ERROR' }),
      maxPolls: 1,
      pollSleep: 0,
    })).rejects.toMatchObject({ _tag: 'IllegalJobTransitionError', from: 'failed', to: 'failed' })
    const job = (await db.select().from(jobs).where(eq(jobs.id, registered.jobId)))[0]
    expect(job?.errorCode).toBe('timeout')
    expect(job?.errorMessage).toBe('other failure')
  })

  it('rejects an unexpected predecessor without changing another job', async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    const first = await registerUrlSource(db, { url: 'https://example.com/first', notebook }, {
      create: async () => ({ id: 'wf-1' }),
    })
    const second = await registerUrlSource(db, { url: 'https://example.com/second', notebook }, {
      create: async () => ({ id: 'wf-2' }),
    })
    const step: IngestStep = {
      do: async (name, callback) => {
        if (name === 'waiting-to-persisting') {
          await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, first.jobId))
        }
        return callback()
      },
      sleep: async () => {},
    }
    await expect(runIngestWorkflow({
      params: { mode: 'fetch', jobId: first.jobId, sourceId: first.sourceId, url: 'https://example.com/first' },
      db,
      step,
      cursor: createMockCursorClient(),
      maxPolls: 1,
      pollSleep: 0,
    })).rejects.toMatchObject({ _tag: 'IllegalJobTransitionError', from: 'queued', to: 'persisting' })
    expect((await db.select().from(jobs).where(eq(jobs.id, first.jobId)))[0]?.status).toBe('queued')
    expect((await db.select().from(jobs).where(eq(jobs.id, second.jobId)))[0]?.status).toBe('queued')
  })

  it('persists body/summary and marks the job succeeded on FINISHED JSON', async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    const registered = await registerUrlSource(db, { url: 'https://example.com/ok', notebook }, {
      create: async () => ({ id: 'wf' }),
    })

    await runIngestWorkflow({
      params: { mode: 'fetch', jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/ok' },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient(),
      maxPolls: 2,
      pollSleep: 0,
    })

    const source = (await db.select().from(sources).where(eq(sources.id, registered.sourceId)))[0]
    const job = (await db.select().from(jobs).where(eq(jobs.id, registered.jobId)))[0]
    expect(job?.status).toBe('succeeded')
    expect(job?.kind).toBe('fetch')
    expect(source?.title).toBe(MOCK_INGEST_JSON.title)
    expect(source?.summary).toBe(MOCK_INGEST_JSON.summary)
    expect(source?.body).toBe(MOCK_INGEST_JSON.body)
    expect(source?.fetchStatus).toBe('full')
    expect(source?.acquiredVia).toBe('fetch')
    expect(source?.contentHash).toBeTruthy()
  })

  it('does not overwrite memo or notebook_id when persisting ingest output', async () => {
    const { db } = createTestDb()
    const originId = await seedNotebook(db, '元')
    const registered = await registerUrlSource(db, { url: 'https://example.com/keep-org', notebook: originId }, {
      create: async () => ({ id: 'wf' }),
    })
    const researchId = await seedNotebook(db, '研究')
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({
        type: 'move-source',
        sourceId: registered.sourceId,
        notebookId: researchId,
      }),
    )
    await applyOrganizationCommand(
      db,
      organizationCommandSchema.parse({
        type: 'set-memo',
        sourceId: registered.sourceId,
        memo: '残すメモ',
      }),
    )

    await runIngestWorkflow({
      params: { mode: 'fetch', jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/keep-org' },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient(),
      maxPolls: 2,
      pollSleep: 0,
    })

    const source = (await db.select().from(sources).where(eq(sources.id, registered.sourceId)))[0]
    expect(source?.memo).toBe('残すメモ')
    expect(source?.notebookId).toBe(researchId)
    expect(source?.summary).toBe(MOCK_INGEST_JSON.summary)
    expect(source?.body).toBe(MOCK_INGEST_JSON.body)
  })

  it('fails the job with a UI-facing error and does not require a body', async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    const registered = await registerUrlSource(db, { url: 'https://example.com/fail', notebook }, {
      create: async () => ({ id: 'wf' }),
    })

    await runIngestWorkflow({
      params: { mode: 'fetch', jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/fail' },
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
    const notebook = await seedNotebook(db)
    const registered = await registerUrlSource(db, { url: 'https://example.com/nokey', notebook }, {
      create: async () => ({ id: 'wf' }),
    })

    await runIngestWorkflow({
      params: { mode: 'fetch', jobId: registered.jobId, sourceId: registered.sourceId, url: 'https://example.com/nokey' },
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

  it('truncates oversized fetch bodies to the source cap and marks partial', async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    const registered = await registerUrlSource(db, { url: 'https://example.com/huge', notebook }, {
      create: async () => ({ id: 'wf' }),
    })
    const hugeBody = `${'x'.repeat(MAX_SOURCE_BODY_CHARS)}TAIL`

    await runIngestWorkflow({
      params: {
        mode: 'fetch',
        jobId: registered.jobId,
        sourceId: registered.sourceId,
        url: 'https://example.com/huge',
      },
      db,
      step: createImmediateStep(),
      cursor: createMockCursorClient({
        result: JSON.stringify({ ...MOCK_INGEST_JSON, body: hugeBody, fetchStatus: 'full' }),
      }),
      maxPolls: 2,
      pollSleep: 0,
    })

    const source = (await db.select().from(sources).where(eq(sources.id, registered.sourceId)))[0]
    expect(source?.body).toHaveLength(MAX_SOURCE_BODY_CHARS)
    expect(source?.body?.endsWith('TAIL')).toBe(false)
    expect(source?.fetchStatus).toBe('partial')
  })
})
