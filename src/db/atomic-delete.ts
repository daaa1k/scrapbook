import { and, eq, exists, inArray, sql } from 'drizzle-orm'
import { DrizzleD1Database } from 'drizzle-orm/d1'
import { citations, cursorRuns, jobs, notebooks, qaAnswers, sources } from './schema'
import type { AppDb } from './types'

// Keep the active-job predicate on every statement. A batch with zero changed
// rows is successful SQL, so callers must check the final DELETE's result.
function activeJobGuard(scope: ReturnType<typeof sql>) {
  return sql`not exists (
    select 1 from jobs as active_jobs
    join sources as active_sources on active_sources.id = active_jobs.source_id
    where ${scope} and active_jobs.status not in ('succeeded', 'failed')
  )`
}

function sourceStatements(db: AppDb, sourceId: string, notebookId: string, updatedAt: number) {
  const guard = activeJobGuard(sql`active_sources.id = ${sourceId}`)
  const eligible = () => db.select({ id: sources.id }).from(sources)
    .where(and(eq(sources.id, sourceId), guard))
  const eligibleJobs = () => db.select({ id: jobs.id }).from(jobs)
    .where(inArray(jobs.sourceId, eligible()))
  return [
    db.update(notebooks).set({ updatedAt }).where(and(
      eq(notebooks.id, notebookId), exists(eligible()),
    )),
    db.delete(qaAnswers).where(inArray(qaAnswers.sourceId, eligible())),
    db.delete(citations).where(inArray(citations.sourceId, eligible())),
    db.delete(cursorRuns).where(inArray(cursorRuns.jobId, eligibleJobs())),
    db.delete(jobs).where(inArray(jobs.sourceId, eligible())),
    db.delete(sources).where(and(eq(sources.id, sourceId), guard)).returning({ id: sources.id }),
  ] as const
}

function notebookStatements(db: AppDb, notebookId: string) {
  const guard = activeJobGuard(sql`active_sources.notebook_id = ${notebookId}`)
  const eligible = () => db.select({ id: sources.id }).from(sources)
    .where(and(eq(sources.notebookId, notebookId), guard))
  const eligibleJobs = () => db.select({ id: jobs.id }).from(jobs)
    .where(inArray(jobs.sourceId, eligible()))
  return [
    db.select({ r2Key: sources.r2Key }).from(sources).where(eq(sources.notebookId, notebookId)),
    db.delete(qaAnswers).where(inArray(qaAnswers.sourceId, eligible())),
    db.delete(citations).where(inArray(citations.sourceId, eligible())),
    db.delete(cursorRuns).where(inArray(cursorRuns.jobId, eligibleJobs())),
    db.delete(jobs).where(inArray(jobs.sourceId, eligible())),
    db.delete(sources).where(and(eq(sources.notebookId, notebookId), guard)),
    db.delete(notebooks).where(and(eq(notebooks.id, notebookId), guard))
      .returning({ id: notebooks.id }),
  ] as const
}

export async function deleteSourceRows(db: AppDb, sourceId: string, notebookId: string, updatedAt: number): Promise<boolean> {
  const statements = sourceStatements(db, sourceId, notebookId, updatedAt)
  if (db instanceof DrizzleD1Database) {
    const results = await db.batch([...statements])
    return results[5].length > 0
  }
  return db.transaction(() => {
    statements[0].run()
    statements[1].run()
    statements[2].run()
    statements[3].run()
    statements[4].run()
    return (statements[5].all() as { id: string }[]).length > 0
  })
}

export async function deleteNotebookRows(db: AppDb, notebookId: string): Promise<{ deleted: boolean; r2Keys: string[] }> {
  const statements = notebookStatements(db, notebookId)
  if (db instanceof DrizzleD1Database) {
    const results = await db.batch([...statements])
    return {
      deleted: results[6].length > 0,
      r2Keys: results[0].flatMap((row) => row.r2Key ? [row.r2Key] : []),
    }
  }
  return db.transaction(() => {
    const keys = statements[0].all() as { r2Key: string | null }[]
    statements[1].run()
    statements[2].run()
    statements[3].run()
    statements[4].run()
    statements[5].run()
    return {
      deleted: (statements[6].all() as { id: string }[]).length > 0,
      r2Keys: keys.flatMap((row) => row.r2Key ? [row.r2Key] : []),
    }
  })
}
