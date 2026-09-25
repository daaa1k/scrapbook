import { eq } from 'drizzle-orm'
import { DrizzleD1Database } from 'drizzle-orm/d1'
import { citations, qaAnswers, qaCitations, sources } from './schema'
import type { AppDb } from './types'

export async function saveSourceResult(
  db: AppDb,
  sourceId: string,
  patch: Partial<typeof sources.$inferInsert>,
  rows: (typeof citations.$inferInsert)[],
): Promise<void> {
  if (db instanceof DrizzleD1Database) {
    if (rows.length > 0) {
      await db.batch([
        db.update(sources).set(patch).where(eq(sources.id, sourceId)),
        db.delete(citations).where(eq(citations.sourceId, sourceId)),
        db.insert(citations).values(rows),
      ])
    } else {
      await db.batch([
        db.update(sources).set(patch).where(eq(sources.id, sourceId)),
        db.delete(citations).where(eq(citations.sourceId, sourceId)),
      ])
    }
    return
  }

  db.transaction((tx) => {
    tx.update(sources).set(patch).where(eq(sources.id, sourceId)).run()
    tx.delete(citations).where(eq(citations.sourceId, sourceId)).run()
    if (rows.length > 0) tx.insert(citations).values(rows).run()
  })
}

export async function saveAnswerResult(
  db: AppDb,
  qaAnswerId: string,
  patch: Pick<typeof qaAnswers.$inferInsert, 'answer' | 'updatedAt'>,
  rows: (typeof qaCitations.$inferInsert)[],
): Promise<void> {
  if (db instanceof DrizzleD1Database) {
    if (rows.length > 0) {
      await db.batch([
        db.update(qaAnswers).set(patch).where(eq(qaAnswers.id, qaAnswerId)),
        db.delete(qaCitations).where(eq(qaCitations.qaAnswerId, qaAnswerId)),
        db.insert(qaCitations).values(rows),
      ])
    } else {
      await db.batch([
        db.update(qaAnswers).set(patch).where(eq(qaAnswers.id, qaAnswerId)),
        db.delete(qaCitations).where(eq(qaCitations.qaAnswerId, qaAnswerId)),
      ])
    }
    return
  }

  db.transaction((tx) => {
    tx.update(qaAnswers).set(patch).where(eq(qaAnswers.id, qaAnswerId)).run()
    tx.delete(qaCitations).where(eq(qaCitations.qaAnswerId, qaAnswerId)).run()
    if (rows.length > 0) tx.insert(qaCitations).values(rows).run()
  })
}
