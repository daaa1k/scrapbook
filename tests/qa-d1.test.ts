import { Miniflare } from 'miniflare'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import { jobs, qaAnswers } from '../src/db/schema'
import { askSourceQuestion, pasteSourceBody } from '../src/server/ingest/register'
import { migrationStatements } from './helpers/db'
import { seedNotebook } from './helpers/notebook'

describe('ask source on local D1', () => {
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
