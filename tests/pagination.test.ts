import { eq } from 'drizzle-orm'
import { Miniflare } from 'miniflare'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/db/client'
import { jobs, qaAnswers, qaCitations, sources } from '../src/db/schema'
import { EMPTY_SOURCE_LIST_FILTER } from '../src/domain/organization'
import { PAGE_SIZE } from '../src/domain/source-views'
import { pasteSourceBody } from '../src/server/ingest/register'
import { listQaPage, listSourcePage } from '../src/server/source-views'
import { createTestDb, migrationStatements } from './helpers/db'
import { seedNotebook } from './helpers/notebook'

describe('bounded pages', () => {
  it('walks timestamp and title ties without gaps, and searches beyond the first page', async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    const ids: string[] = []
    for (let index = 0; index < PAGE_SIZE + 6; index++) {
      const source = await pasteSourceBody(db, {
        title: index === 0 ? '遠い検索語' : '同じ題名',
        body: index === 0 ? '遠い本文検索語' : '本文', notebook,
      })
      ids.push(source.sourceId)
      await db.update(sources).set({ createdAt: 100, updatedAt: 100 }).where(eq(sources.id, source.sourceId))
    }
    for (const sort of ['created', 'updated', 'title'] as const) {
      const found: string[] = []
      let cursor = null
      do {
        const page = await listSourcePage(db, { ...EMPTY_SOURCE_LIST_FILTER, sort, cursor })
        expect(page.items.length).toBeLessThanOrEqual(PAGE_SIZE)
        found.push(...page.items.map((item) => item.id))
        cursor = page.nextCursor
      } while (cursor)
      expect(found).toHaveLength(ids.length)
      expect(new Set(found).size).toBe(ids.length)
    }
    const searched = await listSourcePage(db, { ...EMPTY_SOURCE_LIST_FILTER, q: '遠い本文検索語', sort: 'created', cursor: null })
    expect(searched.items.map((item) => item.id)).toEqual([ids[0]])
  })

  it('limits question history and citations to each page', async () => {
    const { db } = createTestDb()
    const notebook = await seedNotebook(db)
    const source = await pasteSourceBody(db, { title: '履歴', body: '本文', notebook })
    for (let index = 0; index < PAGE_SIZE + 4; index++) {
      const id = `qa-${index}`
      const jobId = `job-${index}`
      await db.insert(jobs).values({ id: jobId, sourceId: source.sourceId, kind: 'ask_source', status: 'succeeded', createdAt: 100, updatedAt: 100 })
      await db.insert(qaAnswers).values({ id, sourceId: source.sourceId, jobId, question: index === 0 ? '遠い質問' : '質問', answer: '回答', createdAt: 100, updatedAt: 100 })
      await db.insert(qaCitations).values({ id: `cite-${index}`, qaAnswerId: id, locator: '1', excerpt: '本文', createdAt: 100 })
    }
    const first = await listQaPage(db, { sourceId: source.sourceId, q: '', cursor: null })
    expect(first.qaAnswers).toHaveLength(PAGE_SIZE)
    expect(first.qaAnswers.every((answer) => answer.citations.length === 1)).toBe(true)
    const second = await listQaPage(db, { sourceId: source.sourceId, q: '', cursor: first.qaNextCursor })
    const all = [...first.qaAnswers, ...second.qaAnswers]
    expect(all).toHaveLength(PAGE_SIZE + 4)
    expect(new Set(all.map((answer) => answer.id)).size).toBe(all.length)
    expect(second.qaNextCursor).toBeNull()
    expect((await listQaPage(db, { sourceId: source.sourceId, q: '遠い質問', cursor: null })).qaAnswers.map((answer) => answer.id)).toEqual(['qa-0'])
  })

  it('uses the same bounded cursor behavior on local D1', async () => {
    const miniflare = new Miniflare({ workers: [{ config: {
      name: 'test', type: 'worker', compatibilityDate: '2026-09-15',
      manifest: { mainModule: 'index.js', modules: { 'index.js': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } },
      env: { DB: { type: 'd1', name: 'test-db' } },
    } }] })
    try {
      const d1 = await miniflare.getD1Database('DB')
      for (const statement of migrationStatements()) await d1.prepare(statement).run()
      const db = createDb(d1)
      const notebook = await seedNotebook(db)
      for (let index = 0; index < PAGE_SIZE + 1; index++) {
        const source = await pasteSourceBody(db, { title: `資料 ${index}`, body: '本文', notebook })
        await db.update(sources).set({ createdAt: 100 }).where(eq(sources.id, source.sourceId))
      }
      const first = await listSourcePage(db, { ...EMPTY_SOURCE_LIST_FILTER, sort: 'created', cursor: null })
      const second = await listSourcePage(db, { ...EMPTY_SOURCE_LIST_FILTER, sort: 'created', cursor: first.nextCursor })
      expect(first.items).toHaveLength(PAGE_SIZE)
      expect(second.items).toHaveLength(1)
      expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(PAGE_SIZE + 1)
    } finally {
      await miniflare.dispose()
    }
  }, 30_000)
})
