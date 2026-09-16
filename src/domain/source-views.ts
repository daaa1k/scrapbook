import { z } from 'zod'
import { jobStatusSchema } from '~/domain/jobs'
import { notebookRefSchema, sourceOrganizationSchema, tagNameSchema } from '~/domain/organization'
import { acquiredViaSchema } from '~/domain/url'

export const sourceJobSchema = z.object({
  id: z.string(),
  status: jobStatusSchema,
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
  createdAt: z.number(),
  notebook: notebookRefSchema,
  tags: z.array(tagNameSchema),
})
export type SourceListItem = z.infer<typeof sourceListItemSchema>

export const sourceDetailSchema = z.object({
  id: z.string(),
  kind: z.string(),
  url: z.string().nullable(),
  title: z.string().nullable(),
  author: z.string().nullable(),
  fetchStatus: z.string(),
  acquiredVia: acquiredViaSchema,
  summary: z.string().nullable(),
  body: z.string().nullable(),
  job: sourceJobSchema.nullable(),
  organization: sourceOrganizationSchema,
})
export type SourceDetail = z.infer<typeof sourceDetailSchema>
