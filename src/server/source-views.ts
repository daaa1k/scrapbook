import { and, desc, eq, exists, inArray, or, sql } from 'drizzle-orm'
import {
  citations as citationsTable,
  jobs,
  notebooks,
  qaAnswers,
  qaCitations,
  sources,
  sourceTags,
} from '~/db/schema'
import type { AppDb } from '~/db/types'
import { citationViewFromRow } from '~/domain/citations'
import { isTerminalJobStatus, jobKindSchema, jobStatusSchema, type JobStatus } from '~/domain/jobs'
import {
  notebookIdSchema,
  notebookTitleSchema,
  tagNameSchema,
  type SourceListFilter,
  type TagName,
} from '~/domain/organization'
import { likeContainsPattern } from '~/domain/search'
import {
  sourceDetailSchema,
  sourceListItemSchema,
  type SourceDetail,
  type SourceListItem,
} from '~/domain/source-views'
import { latestJobForSource } from '~/server/ingest/register'

function notebookRef(id: string, title: string) {
  return {
    id: notebookIdSchema.parse(id),
    title: notebookTitleSchema.parse(title),
  }
}

async function listTagsBySourceIds(db: AppDb, sourceIds: string[]): Promise<Map<string, TagName[]>> {
  const tagsBySource = new Map<string, TagName[]>()
  if (sourceIds.length === 0) return tagsBySource
  const rows = await db
    .select({ sourceId: sourceTags.sourceId, tagName: sourceTags.tagName })
    .from(sourceTags)
    .where(inArray(sourceTags.sourceId, sourceIds))
    .orderBy(sourceTags.tagName)
  for (const row of rows) {
    const tagName = tagNameSchema.parse(row.tagName)
    const current = tagsBySource.get(row.sourceId)
    if (current) current.push(tagName)
    else tagsBySource.set(row.sourceId, [tagName])
  }
  return tagsBySource
}

function sourceFilterWhere(db: AppDb, filter: SourceListFilter) {
  const conditions = []
  const pattern = likeContainsPattern(filter.q)
  if (pattern) {
    conditions.push(
      or(sql`${sources.title} LIKE ${pattern} ESCAPE '\\'`, sql`${sources.body} LIKE ${pattern} ESCAPE '\\'`),
    )
  }
  if (filter.notebookId) {
    conditions.push(eq(sources.notebookId, filter.notebookId))
  }
  if (filter.tagName) {
    conditions.push(
      exists(
        db
          .select({ ok: sql`1` })
          .from(sourceTags)
          .where(and(eq(sourceTags.sourceId, sources.id), eq(sourceTags.tagName, filter.tagName))),
      ),
    )
  }
  if (conditions.length === 0) return undefined
  return and(...conditions)
}

export async function listSourceViews(db: AppDb, filter: SourceListFilter): Promise<readonly SourceListItem[]> {
  const rows = await db
    .select({
      id: sources.id,
      title: sources.title,
      url: sources.url,
      kind: sources.kind,
      fetchStatus: sources.fetchStatus,
      acquiredVia: sources.acquiredVia,
      createdAt: sources.createdAt,
      updatedAt: sources.updatedAt,
      notebookId: notebooks.id,
      notebookTitle: notebooks.title,
    })
    .from(sources)
    .innerJoin(notebooks, eq(sources.notebookId, notebooks.id))
    .where(sourceFilterWhere(db, filter))
    .orderBy(desc(sources.createdAt), desc(sql`${sources}."rowid"`))

  const tagsBySource = await listTagsBySourceIds(
    db,
    rows.map((row) => row.id),
  )
  const items: SourceListItem[] = []
  for (const row of rows) {
    const job = await latestJobForSource(db, row.id)
    items.push(
      sourceListItemSchema.parse({
        id: row.id,
        title: row.title,
        url: row.url,
        kind: row.kind,
        fetchStatus: row.fetchStatus,
        acquiredVia: row.acquiredVia,
        jobStatus: job ? jobStatusSchema.parse(job.status) : null,
        jobKind: job ? jobKindSchema.parse(job.kind) : null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        notebook: notebookRef(row.notebookId, row.notebookTitle),
        tags: tagsBySource.get(row.id) ?? [],
      }),
    )
  }
  return items
}

export async function readSourceDetail(db: AppDb, sourceId: string): Promise<SourceDetail> {
  const rows = await db
    .select({
      id: sources.id,
      kind: sources.kind,
      url: sources.url,
      title: sources.title,
      author: sources.author,
      fetchStatus: sources.fetchStatus,
      acquiredVia: sources.acquiredVia,
      summary: sources.summary,
      body: sources.body,
      memo: sources.memo,
      notebookId: notebooks.id,
      notebookTitle: notebooks.title,
    })
    .from(sources)
    .innerJoin(notebooks, eq(sources.notebookId, notebooks.id))
    .where(eq(sources.id, sourceId))
    .limit(1)
  const row = rows[0]
  if (!row) {
    throw new Error('source_not_found')
  }
  const [job, tagsBySource, citationRows, answerRows] = await Promise.all([
    latestJobForSource(db, row.id),
    listTagsBySourceIds(db, [row.id]),
    db
      .select({
        id: citationsTable.id,
        locator: citationsTable.locator,
        excerpt: citationsTable.excerpt,
      })
      .from(citationsTable)
      .where(eq(citationsTable.sourceId, row.id))
      .orderBy(citationsTable.createdAt, sql`rowid`),
    db
      .select({
        id: qaAnswers.id,
        question: qaAnswers.question,
        answer: qaAnswers.answer,
        jobStatus: jobs.status,
      })
      .from(qaAnswers)
      .innerJoin(jobs, eq(qaAnswers.jobId, jobs.id))
      .where(eq(qaAnswers.sourceId, row.id))
      .orderBy(desc(qaAnswers.createdAt), desc(sql`${qaAnswers}."rowid"`)),
  ])
  const qaCitationRows =
    answerRows.length === 0
      ? []
      : await db
          .select({
            id: qaCitations.id,
            qaAnswerId: qaCitations.qaAnswerId,
            locator: qaCitations.locator,
            excerpt: qaCitations.excerpt,
          })
          .from(qaCitations)
          .where(
            inArray(
              qaCitations.qaAnswerId,
              answerRows.map((answer) => answer.id),
            ),
          )
          .orderBy(qaCitations.createdAt, sql`rowid`)
  const citationsByAnswer = new Map<string, typeof qaCitationRows>()
  for (const citationRow of qaCitationRows) {
    const current = citationsByAnswer.get(citationRow.qaAnswerId)
    if (current) current.push(citationRow)
    else citationsByAnswer.set(citationRow.qaAnswerId, [citationRow])
  }
  return sourceDetailSchema.parse({
    id: row.id,
    kind: row.kind,
    url: row.url,
    title: row.title,
    author: row.author,
    fetchStatus: row.fetchStatus,
    acquiredVia: row.acquiredVia,
    summary: row.summary,
    body: row.body,
    job: job
      ? {
          id: job.id,
          status: jobStatusSchema.parse(job.status) as JobStatus,
          kind: jobKindSchema.parse(job.kind),
          errorCode: job.errorCode,
          errorMessage: job.errorMessage,
        }
      : null,
    organization: {
      notebook: notebookRef(row.notebookId, row.notebookTitle),
      tags: tagsBySource.get(row.id) ?? [],
      memo: row.memo,
    },
    citations: citationRows.map((citationRow) => citationViewFromRow(citationRow, row.body)),
    qaAnswers: answerRows.map((answer) => ({
      id: answer.id,
      question: answer.question,
      answer: answer.answer,
      canDelete: isTerminalJobStatus(jobStatusSchema.parse(answer.jobStatus)),
      citations: (citationsByAnswer.get(answer.id) ?? []).map((citationRow) =>
        citationViewFromRow(citationRow, row.body),
      ),
    })),
  })
}
