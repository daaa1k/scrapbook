import { z } from 'zod'

export const cursorRunStatusSchema = z.enum([
  'CREATING',
  'RUNNING',
  'FINISHED',
  'ERROR',
  'CANCELLED',
  'EXPIRED',
])

export type CursorRunStatus = z.infer<typeof cursorRunStatusSchema>

export const cursorAgentStatusSchema = z.enum(['ACTIVE', 'IDLE', 'ARCHIVED'])

const isoDate = z.string()

export const cursorRunSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  status: cursorRunStatusSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
  durationMs: z.number().optional(),
  result: z.string().optional(),
})

export const cursorAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: cursorAgentStatusSchema,
  createdAt: isoDate,
  updatedAt: isoDate,
  latestRunId: z.string().optional(),
  url: z.string().optional(),
})

export const createAgentResponseSchema = z.object({
  agent: cursorAgentSchema,
  run: cursorRunSchema,
})

export const createFollowUpResponseSchema = z.object({
  run: cursorRunSchema,
})

export type CursorRun = z.infer<typeof cursorRunSchema>
export type CursorAgent = z.infer<typeof cursorAgentSchema>
export type CreateAgentResponse = z.infer<typeof createAgentResponseSchema>

export const FAILED_CURSOR_RUN_STATUSES = new Set<CursorRunStatus>([
  'ERROR',
  'CANCELLED',
  'EXPIRED',
])
