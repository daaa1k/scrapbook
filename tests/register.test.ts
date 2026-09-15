import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { sources } from '../src/db/schema'
import { registerUrlSource } from '../src/server/ingest/register'
import { createTestDb } from './helpers/db'

describe('register ingest', () => {
  it('creates a default notebook, source, and queued job', async () => {
    const { db } = createTestDb()
    const created: unknown[] = []
    const result = await registerUrlSource(
      db,
      { url: 'https://Example.com/post/' },
      {
        create: async (options) => {
          created.push(options.params)
          return { id: 'wf-1' }
        },
      },
    )

    expect(result.duplicate).toBe(false)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({
      sourceId: result.sourceId,
      jobId: result.jobId,
      url: 'https://example.com/post',
    })

    const rows = await db.select().from(sources)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.notebookId).toBeTruthy()
    expect(rows[0]?.fetchStatus).toBe('none')
    expect(rows[0]?.kind).toBe('url')
    expect(rows[0]?.url).toBe('https://Example.com/post/')
    expect(rows[0]?.normalizedUrl).toBe('https://example.com/post')
  })

  it('does not create a second source for a duplicate normalized URL', async () => {
    const { db } = createTestDb()
    const workflow = { create: async () => ({ id: 'wf' }) }
    const first = await registerUrlSource(db, { url: 'https://example.com/a' }, workflow)
    const second = await registerUrlSource(db, { url: 'HTTPS://EXAMPLE.COM/a/' }, workflow)
    expect(second.duplicate).toBe(true)
    expect(second.sourceId).toBe(first.sourceId)
    expect(second.jobId).toBe(first.jobId)
    const rows = await db.select().from(sources).where(eq(sources.normalizedUrl, 'https://example.com/a'))
    expect(rows).toHaveLength(1)
  })
})
