import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const notebooks = sqliteTable(
  'notebooks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [uniqueIndex('notebooks_title_unique').on(table.title)],
)

export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey(),
    notebookId: text('notebook_id')
      .notNull()
      .references(() => notebooks.id),
    kind: text('kind').notNull(),
    url: text('url'),
    normalizedUrl: text('normalized_url'),
    title: text('title'),
    author: text('author'),
    publishedAt: integer('published_at'),
    fetchedAt: integer('fetched_at'),
    body: text('body'),
    summary: text('summary'),
    memo: text('memo'),
    contentHash: text('content_hash'),
    fetchStatus: text('fetch_status').notNull(),
    acquiredVia: text('acquired_via').notNull().default('fetch'),
    r2Key: text('r2_key'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('sources_normalized_url_unique').on(table.normalizedUrl),
    index('sources_notebook_created_idx').on(table.notebookId, table.createdAt),
  ],
)

export const sourceTags = sqliteTable(
  'source_tags',
  {
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    tagName: text('tag_name').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.tagName] }),
    index('source_tags_tag_source_idx').on(table.tagName, table.sourceId),
  ],
)

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    kind: text('kind').notNull().default('fetch'),
    status: text('status').notNull(),
    cursorAgentId: text('cursor_agent_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    startedAt: integer('started_at'),
    finishedAt: integer('finished_at'),
  },
  (table) => [
    index('jobs_source_created_idx').on(table.sourceId, table.createdAt),
    uniqueIndex('jobs_one_active_per_source')
      .on(table.sourceId)
      .where(sql`${table.status} not in ('succeeded', 'failed')`),
  ],
)

export const cursorRuns = sqliteTable(
  'cursor_runs',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id),
    agentId: text('agent_id').notNull(),
    runId: text('run_id').notNull(),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('cursor_runs_run_idx').on(table.runId)],
)

export const citations = sqliteTable(
  'citations',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    locator: text('locator').notNull(),
    excerpt: text('excerpt').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('citations_source_created_idx').on(table.sourceId, table.createdAt)],
)

export const qaAnswers = sqliteTable(
  'qa_answers',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id),
    jobId: text('job_id')
      .notNull()
      .references(() => jobs.id),
    question: text('question').notNull(),
    answer: text('answer'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('qa_answers_source_created_idx').on(table.sourceId, table.createdAt)],
)

export const qaCitations = sqliteTable(
  'qa_citations',
  {
    id: text('id').primaryKey(),
    qaAnswerId: text('qa_answer_id')
      .notNull()
      .references(() => qaAnswers.id, { onDelete: 'cascade' }),
    locator: text('locator').notNull(),
    excerpt: text('excerpt').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('qa_citations_answer_created_idx').on(table.qaAnswerId, table.createdAt)],
)
