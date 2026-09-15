import { desc, or, sql } from 'drizzle-orm'
import { sources } from '~/db/schema'
import type { AppDb } from '~/db/types'
import { likeContainsPattern } from '~/domain/search'

export async function findSourcesByQuery(db: AppDb, q: string) {
  const pattern = likeContainsPattern(q)
  if (!pattern) {
    return db.select().from(sources).orderBy(desc(sources.createdAt))
  }
  return db
    .select()
    .from(sources)
    .where(
      or(sql`${sources.title} LIKE ${pattern} ESCAPE '\\'`, sql`${sources.body} LIKE ${pattern} ESCAPE '\\'`),
    )
    .orderBy(desc(sources.createdAt))
}
