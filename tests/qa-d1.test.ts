import { Miniflare } from 'miniflare'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import { saveAnswerResult, saveSourceResult } from '../src/db/atomic-result'
import { citations, jobs, qaAnswers, qaCitations, sources } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { askSourceQuestion, pasteSourceBody } from '../src/server/ingest/register'
import { migrationStatements } from './helpers/db'
import { seedNotebook } from './helpers/notebook'

describe('ask source on local D1', () => {
  it('rolls back source and answer snapshots on citation failure, and clears empty snapshots', async () => {
    const miniflare = new Miniflare({ workers: [{ config: {
      name: 'test', type: 'worker', compatibilityDate: '2026-09-15',
      manifest: { mainModule: 'index.js', modules: {
        'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' },
      } },
      env: { DB: { type: 'd1', name: 'test-db' } },
    } }] })
    try {
      const d1 = await miniflare.getD1Database('DB')
      for (const statement of migrationStatements()) await d1.prepare(statement).run()
      const db = createDb(d1)
      const pasted = await pasteSourceBody(db, { title: 'old title', body: 'old body', notebook: await seedNotebook(db) })
      await db.update(sources).set({ summary: 'old summary' }).where(eq(sources.id, pasted.sourceId))
      await db.insert(citations).values({ id: 'old-source', sourceId: pasted.sourceId, locator: '-', excerpt: 'old', createdAt: 1 })
      let qaAnswerId = ''
      const started = await askSourceQuestion(db, pasted.sourceId, 'question', { create: async ({ params }) => {
        qaAnswerId = (params as { qaAnswerId: string }).qaAnswerId
        return { id: 'wf' }
      } })
      await db.update(qaAnswers).set({ answer: 'old answer' }).where(eq(qaAnswers.id, qaAnswerId))
      await db.insert(qaCitations).values({ id: 'old-qa', qaAnswerId, locator: '-', excerpt: 'old', createdAt: 1 })
      await d1.prepare(`CREATE TRIGGER reject_source_cite BEFORE INSERT ON citations
        WHEN NEW.excerpt = 'reject' BEGIN SELECT RAISE(ABORT, 'source_citation_failed'); END;`).run()
      await d1.prepare(`CREATE TRIGGER reject_qa_cite BEFORE INSERT ON qa_citations
        WHEN NEW.excerpt = 'reject' BEGIN SELECT RAISE(ABORT, 'qa_citation_failed'); END;`).run()

      await expect(saveSourceResult(db, pasted.sourceId, { title: 'new title', body: 'new body', summary: 'new summary' }, [
        { id: 'new-source', sourceId: pasted.sourceId, locator: '-', excerpt: 'reject', createdAt: 2 },
        { id: 'second-source', sourceId: pasted.sourceId, locator: '-', excerpt: 'second', createdAt: 2 },
      ])).rejects.toThrow('source_citation_failed')
      await expect(saveAnswerResult(db, qaAnswerId, { answer: 'new answer', updatedAt: 2 }, [
        { id: 'new-qa', qaAnswerId, locator: '-', excerpt: 'reject', createdAt: 2 },
        { id: 'second-qa', qaAnswerId, locator: '-', excerpt: 'second', createdAt: 2 },
      ])).rejects.toThrow('qa_citation_failed')
      expect((await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0])
        .toMatchObject({ title: 'old title', body: 'old body', summary: 'old summary' })
      expect((await db.select().from(qaAnswers).where(eq(qaAnswers.id, qaAnswerId)))[0]?.answer).toBe('old answer')
      expect(await db.select().from(citations)).toEqual([expect.objectContaining({ id: 'old-source' })])
      expect(await db.select().from(qaCitations)).toEqual([expect.objectContaining({ id: 'old-qa' })])

      await saveSourceResult(db, pasted.sourceId, { summary: 'empty source citations' }, [])
      await saveAnswerResult(db, qaAnswerId, { answer: 'empty qa citations', updatedAt: 3 }, [])
      expect((await db.select().from(sources).where(eq(sources.id, pasted.sourceId)))[0]?.summary).toBe('empty source citations')
      expect((await db.select().from(qaAnswers).where(eq(qaAnswers.id, qaAnswerId)))[0]?.answer).toBe('empty qa citations')
      expect(await db.select().from(citations)).toHaveLength(0)
      expect(await db.select().from(qaCitations)).toHaveLength(0)
      expect(started.started).toBe(true)
    } finally {
      await miniflare.dispose()
    }
  }, 20_000)
  it('rolls back both inserts when the answer insert fails', async () => {
    const miniflare = new Miniflare({
      workers: [{
        config: {
          name: 'test',
          type: 'worker',
          compatibilityDate: '2026-09-15',
          manifest: {
            mainModule: 'index.js',
            modules: {
              'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' },
            },
          },
          env: { DB: { type: 'd1', name: 'test-db' } },
        },
      }],
    })
    try {
      const d1 = await miniflare.getD1Database('DB')
      for (const statement of migrationStatements()) await d1.prepare(statement).run()
      const db = createDb(d1)
      const pasted = await pasteSourceBody(db, {
        title: 't',
        body: 'body text',
        notebook: await seedNotebook(db),
      })
      await d1.prepare(`
        CREATE TRIGGER reject_qa_answer BEFORE INSERT ON qa_answers
        BEGIN SELECT RAISE(ABORT, 'answer_insert_failed'); END;
      `).run()
      let starts = 0
      await expect(askSourceQuestion(db, pasted.sourceId, '質問', {
        create: async () => {
          starts++
          return { id: 'wf' }
        },
      })).rejects.toThrow('answer_insert_failed')
      expect(await db.select().from(jobs)).toHaveLength(0)
      expect(await db.select().from(qaAnswers)).toHaveLength(0)
      expect(starts).toBe(0)
    } finally {
      await miniflare.dispose()
    }
  }, 20_000)
})
