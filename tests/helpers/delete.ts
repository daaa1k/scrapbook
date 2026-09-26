import { citations, cursorRuns, jobs, notebooks, qaAnswers, qaCitations, sourceTags, sources } from '../../src/db/schema'
import type { AppDb } from '../../src/db/types'
import type { NotebookId } from '../../src/domain/organization'
import { pasteSourceBody } from '../../src/server/ingest/register'
import { seedNotebook } from './notebook'

export async function seedDeleteGraph(db: AppDb, notebookId?: NotebookId) {
  const notebook = notebookId ?? await seedNotebook(db)
  const source = await pasteSourceBody(db, { title: 'delete fixture', body: 'body', notebook })
  const sourceId = source.sourceId
  const jobId = `job-${sourceId}`
  const answerId = `answer-${sourceId}`
  await db.insert(jobs).values({ id: jobId, sourceId, kind: 'ask_source', status: 'succeeded', createdAt: 1, updatedAt: 1 })
  await db.insert(cursorRuns).values({ id: `run-${sourceId}`, jobId, agentId: 'agent', runId: `cursor-${sourceId}`, status: 'FINISHED', createdAt: 1, updatedAt: 1 })
  await db.insert(qaAnswers).values({ id: answerId, sourceId, jobId, question: 'why', answer: 'because', createdAt: 1, updatedAt: 1 })
  await db.insert(qaCitations).values({ id: `qa-cite-${sourceId}`, qaAnswerId: answerId, locator: '1', excerpt: 'quote', createdAt: 1 })
  await db.insert(citations).values({ id: `cite-${sourceId}`, sourceId, locator: '1', excerpt: 'quote', createdAt: 1 })
  await db.insert(sourceTags).values({ sourceId, tagName: 'tag' })
  return { notebookId: source.notebookId, sourceId }
}

export async function deleteGraphSnapshot(db: AppDb) {
  return {
    notebooks: await db.select().from(notebooks),
    sources: await db.select().from(sources),
    sourceTags: await db.select().from(sourceTags),
    jobs: await db.select().from(jobs),
    cursorRuns: await db.select().from(cursorRuns),
    citations: await db.select().from(citations),
    qaAnswers: await db.select().from(qaAnswers),
    qaCitations: await db.select().from(qaCitations),
  }
}
