import { z } from 'zod'

export const ingestWorkflowParamsSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('fetch'),
    jobId: z.string().min(1),
    sourceId: z.string().min(1),
    url: z.string().url(),
  }),
  z.object({
    mode: z.literal('summarize_body'),
    jobId: z.string().min(1),
    sourceId: z.string().min(1),
  }),
  z.object({
    mode: z.literal('ask_source'),
    jobId: z.string().min(1),
    sourceId: z.string().min(1),
    qaAnswerId: z.string().min(1),
  }),
])

export type IngestWorkflowParams = z.infer<typeof ingestWorkflowParamsSchema>

export type WorkflowBinding = {
  create: (options: { params: IngestWorkflowParams }) => Promise<unknown>
}

export async function startIngestWorkflow(
  binding: WorkflowBinding | undefined,
  params: unknown,
): Promise<unknown> {
  const parsed = ingestWorkflowParamsSchema.parse(params)
  if (!binding) {
    throw new Error('INGEST_WORKFLOW binding is not available')
  }
  return binding.create({ params: parsed })
}
