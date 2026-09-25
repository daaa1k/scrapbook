import { and, asc, desc, eq, exists, gt, inArray, lt, or, sql } from 'drizzle-orm'
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
import type { z } from 'zod'
import type { sourcePageInputSchema } from '~/domain/organization'
import {
  PAGE_SIZE,
  sourceDetailSchema,
  sourceJobStatusSchema,
  sourceListItemSchema,
  type QaPageInput,
  type QaPage,
  type SourceDetail,
  type SourceListItem,
  type SourceCursor,
  type SourceJobStatus,
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

async function latestJobsBySourceIds(db: AppDb, sourceIds: string[]) {
  if (sourceIds.length === 0) return new Map<string, { status: string; kind: string }>()
  const rankedJobs = db
    .select({
      sourceId: jobs.sourceId,
      status: jobs.status,
      kind: jobs.kind,
      rank: sql<number>`row_number() over (partition by ${jobs.sourceId} order by ${jobs.createdAt} desc, ${jobs}."rowid" desc)`.as('rank'),
    })
    .from(jobs)
    .where(inArray(jobs.sourceId, sourceIds))
    .as('ranked_jobs')
  const rows = await db
    .select({ sourceId: rankedJobs.sourceId, status: rankedJobs.status, kind: rankedJobs.kind })
    .from(rankedJobs)
    .where(eq(rankedJobs.rank, 1))
  return new Map(rows.map((row) => [row.sourceId, { status: row.status, kind: row.kind }]))
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

type SourcePageInput = z.output<typeof sourcePageInputSchema>

export async function listSourcePage(db: AppDb, input: SourcePageInput): Promise<{ items: SourceListItem[]; nextCursor: SourceCursor | null }> {
  const query = input.q.trim()
  const pattern = likeContainsPattern(query)
  const titleMatches = pattern ? sql<boolean>`${sources.title} LIKE ${pattern} ESCAPE '\\'` : null
  const matchText = titleMatches
    ? sql<string>`case when ${titleMatches} then ${sources.title} else ${sources.body} end`
    : null
  const matchPosition = matchText ? sql<number>`instr(lower(${matchText}), lower(${query}))` : null
  const snippetStart = matchPosition ? sql<number>`max(1, ${matchPosition} - 40)` : null
  const titleKey = sql<string>`coalesce(${sources.title}, ${sources.url}, ${sources.id}) collate nocase`
  const key = input.sort === 'title' ? titleKey : input.sort === 'updated' ? sources.updatedAt : sources.createdAt
  const descending = input.sort !== 'title'
  const cursor = input.cursor
  if (cursor && (typeof cursor.key !== (descending ? 'number' : 'string'))) throw new Error('invalid_source_cursor')
  const position = cursor
    ? descending
      ? sql`(${key} < ${cursor.key} or (${key} = ${cursor.key} and ${sources.id} < ${cursor.id}))`
      : sql`(${key} > ${cursor.key} or (${key} = ${cursor.key} and ${sources.id} > ${cursor.id}))`
    : undefined
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
      ...(titleMatches && matchText && matchPosition && snippetStart
        ? {
            searchField: sql<'title' | 'body'>`case when ${titleMatches} then 'title' else 'body' end`,
            searchExcerpt: sql<string>`substr(${matchText}, ${snippetStart}, 160)`,
            searchStart: sql<number>`${matchPosition} - ${snippetStart}`,
          }
        : {}),
    })
    .from(sources)
    .innerJoin(notebooks, eq(sources.notebookId, notebooks.id))
    .where(and(sourceFilterWhere(db, input), position))
    .orderBy(descending ? desc(key) : asc(key), descending ? desc(sources.id) : asc(sources.id))
    .limit(PAGE_SIZE + 1)

  const pageRows = rows.slice(0, PAGE_SIZE)
  const sourceIds = pageRows.map((row) => row.id)
  const [tagsBySource, jobsBySource] = await Promise.all([
    listTagsBySourceIds(db, sourceIds),
    latestJobsBySourceIds(db, sourceIds),
  ])
  const items: SourceListItem[] = []
  for (const row of pageRows) {
    const job = jobsBySource.get(row.id)
    const searchMatch = 'searchField' in row && typeof row.searchExcerpt === 'string' && typeof row.searchStart === 'number'
      ? {
          field: row.searchField,
          excerpt: row.searchExcerpt,
          start: row.searchStart,
          length: Math.min(Array.from(query).length, 160 - row.searchStart),
        }
      : undefined
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
        ...(searchMatch ? { searchMatch } : {}),
      }),
    )
  }
  const last = pageRows.at(-1)
  const nextCursor = rows.length > PAGE_SIZE && last
    ? { key: input.sort === 'title' ? (last.title ?? last.url ?? last.id) : input.sort === 'updated' ? last.updatedAt : last.createdAt, id: last.id }
    : null
  return { items, nextCursor }
}

/** Compatibility helper for callers that need one bounded first page. */
export async function listSourceViews(db: AppDb, filter: SourceListFilter): Promise<readonly SourceListItem[]> {
  return (await listSourcePage(db, { ...filter, sort: 'created', cursor: null })).items
}

export async function readSourceJob(db: AppDb, sourceId: string): Promise<SourceJobStatus> {
  const source = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, sourceId)).limit(1)
  if (!source[0]) throw new Error('source_not_found')
  const latest = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      kind: jobs.kind,
      errorCode: jobs.errorCode,
      errorMessage: jobs.errorMessage,
    })
    .from(jobs)
    .where(eq(jobs.sourceId, sourceId))
    .orderBy(desc(jobs.createdAt), desc(sql`${jobs}."rowid"`))
    .limit(1)
  const job = latest[0]
  return sourceJobStatusSchema.parse({
    sourceId,
    job: job
      ? {
          id: job.id,
          status: jobStatusSchema.parse(job.status),
          kind: jobKindSchema.parse(job.kind),
          errorCode: job.errorCode,
          errorMessage: job.errorMessage,
        }
      : null,
  })
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
      publishedAt: sources.publishedAt,
      fetchedAt: sources.fetchedAt,
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
  const [job, tagsBySource, citationRows, qaPage] = await Promise.all([
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
    listQaPage(db, { sourceId: row.id, q: '', cursor: null }, row.body),
  ])
  return sourceDetailSchema.parse({
    id: row.id,
    kind: row.kind,
    url: row.url,
    title: row.title,
    author: row.author,
    fetchStatus: row.fetchStatus,
    acquiredVia: row.acquiredVia,
    publishedAt: row.publishedAt,
    fetchedAt: row.fetchedAt,
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
    ...qaPage,
  })
}

export async function listQaPage(db: AppDb, input: QaPageInput, body?: string | null): Promise<QaPage> {
  if (body === undefined) {
    const source = await db.select({ body: sources.body }).from(sources).where(eq(sources.id, input.sourceId)).limit(1)
    if (!source[0]) throw new Error('source_not_found')
    body = source[0].body
  }
  const pattern = likeContainsPattern(input.q)
  const cursor = input.cursor
  const rows = await db.select({
    id: qaAnswers.id,
    question: qaAnswers.question,
    answer: qaAnswers.answer,
    createdAt: qaAnswers.createdAt,
    jobId: jobs.id,
    jobStatus: jobs.status,
    jobErrorCode: jobs.errorCode,
    jobErrorMessage: jobs.errorMessage,
  }).from(qaAnswers).innerJoin(jobs, eq(qaAnswers.jobId, jobs.id))
    .where(and(
      eq(qaAnswers.sourceId, input.sourceId),
      pattern ? or(sql`${qaAnswers.question} LIKE ${pattern} ESCAPE '\\'`, sql`${qaAnswers.answer} LIKE ${pattern} ESCAPE '\\'`) : undefined,
      cursor ? or(lt(qaAnswers.createdAt, cursor.createdAt), and(eq(qaAnswers.createdAt, cursor.createdAt), lt(qaAnswers.id, cursor.id))) : undefined,
    ))
    .orderBy(desc(qaAnswers.createdAt), desc(qaAnswers.id))
    .limit(PAGE_SIZE + 1)
  const pageRows = rows.slice(0, PAGE_SIZE)
  const ids = pageRows.map((row) => row.id)
  const citationRows = ids.length ? await db.select({
    id: qaCitations.id, qaAnswerId: qaCitations.qaAnswerId,
    locator: qaCitations.locator, excerpt: qaCitations.excerpt,
  }).from(qaCitations).where(inArray(qaCitations.qaAnswerId, ids))
    .orderBy(qaCitations.createdAt, qaCitations.id) : []
  const byAnswer = new Map<string, typeof citationRows>()
  for (const citation of citationRows) {
    const current = byAnswer.get(citation.qaAnswerId) ?? []
    current.push(citation)
    byAnswer.set(citation.qaAnswerId, current)
  }
  const last = pageRows.at(-1)
  return {
    qaAnswers: pageRows.map((answer) => ({
      id: answer.id, question: answer.question, answer: answer.answer,
      job: { id: answer.jobId, kind: 'ask_source' as const,
        status: jobStatusSchema.parse(answer.jobStatus),
        errorCode: answer.jobErrorCode, errorMessage: answer.jobErrorMessage },
      canDelete: isTerminalJobStatus(jobStatusSchema.parse(answer.jobStatus)),
      citations: (byAnswer.get(answer.id) ?? []).map((citation) => citationViewFromRow(citation, body ?? null)),
    })),
    qaNextCursor: rows.length > PAGE_SIZE && last ? { createdAt: last.createdAt, id: last.id } : null,
  }
}
