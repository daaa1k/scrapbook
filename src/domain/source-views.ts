import { z } from 'zod'
import { citationViewSchema } from '~/domain/citations'
import { jobKindSchema, jobStatusSchema } from '~/domain/jobs'
import { notebookRefSchema, sourceOrganizationSchema, tagNameSchema } from '~/domain/organization'
import { acquiredViaSchema } from '~/domain/url'

export const sourceJobSchema = z.object({
  id: z.string(),
  status: jobStatusSchema,
  kind: jobKindSchema,
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
})

export const sourceListItemSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  kind: z.string(),
  fetchStatus: z.string(),
  acquiredVia: acquiredViaSchema,
  jobStatus: jobStatusSchema.nullable(),
  jobKind: jobKindSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  notebook: notebookRefSchema,
  tags: z.array(tagNameSchema),
  searchMatch: z.object({
    field: z.enum(['title', 'body']),
    excerpt: z.string().refine((value) => Array.from(value).length <= 160),
    start: z.number().int().nonnegative(),
    length: z.number().int().positive(),
  }).optional(),
})
export type SourceListItem = z.infer<typeof sourceListItemSchema>

export const PAGE_SIZE = 25
export const sourceCursorSchema = z.object({ key: z.union([z.number(), z.string()]), id: z.string() })
export const sourcePageSchema = z.object({
  items: z.array(sourceListItemSchema),
  nextCursor: sourceCursorSchema.nullable(),
})
export type SourceCursor = z.infer<typeof sourceCursorSchema>

export const sourceDetailSchema = z.object({
  id: z.string(),
  kind: z.string(),
  url: z.string().nullable(),
  title: z.string().nullable(),
  author: z.string().nullable(),
  fetchStatus: z.string(),
  acquiredVia: acquiredViaSchema,
  publishedAt: z.number().nullable(),
  fetchedAt: z.number().nullable(),
  summary: z.string().nullable(),
  body: z.string().nullable(),
  job: sourceJobSchema.nullable(),
  organization: sourceOrganizationSchema,
  citations: z.array(citationViewSchema),
  qaAnswers: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      answer: z.string().nullable(),
      job: sourceJobSchema,
      canDelete: z.boolean(),
      citations: z.array(citationViewSchema),
    }),
  ),
  qaNextCursor: z.object({ createdAt: z.number(), id: z.string() }).nullable(),
})
export type SourceDetail = z.infer<typeof sourceDetailSchema>
export const qaPageInputSchema = z.object({
  sourceId: z.string().min(1),
  q: z.string().trim().max(500).default(''),
  cursor: z.object({ createdAt: z.number(), id: z.string() }).nullable().default(null),
})
export type QaPageInput = z.output<typeof qaPageInputSchema>
export type QaPage = Pick<SourceDetail, 'qaAnswers' | 'qaNextCursor'>
