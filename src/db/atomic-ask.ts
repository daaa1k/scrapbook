import { DrizzleD1Database } from 'drizzle-orm/d1'
import { jobs, qaAnswers } from './schema'
import type { AppDb } from './types'

export async function insertAskJobAndAnswer(
  db: AppDb,
  job: typeof jobs.$inferInsert,
  answer: typeof qaAnswers.$inferInsert,
): Promise<void> {
  if (db instanceof DrizzleD1Database) {
    await db.batch([
      db.insert(jobs).values(job),
      db.insert(qaAnswers).values(answer),
    ])
    return
  }

  // The test database uses a synchronous SQLite driver. Keep both writes in
  // its transaction so a failed answer insert also removes the queued job.
  db.transaction((tx) => {
    tx.insert(jobs).values(job).run()
    tx.insert(qaAnswers).values(answer).run()
  })
}
