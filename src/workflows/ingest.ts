import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { createDb } from '~/db/client'
import {
  ingestWorkflowParamsSchema,
  type IngestWorkflowParams,
} from '~/server/ingest/start-workflow'
import { runIngestWorkflow, type IngestStep } from '~/server/ingest/workflow-run'

function asIngestStep(step: WorkflowStep): IngestStep {
  const durableDo = step.do as (
    name: string,
    callback: () => Promise<unknown>,
  ) => Promise<unknown>
  return {
    do: (name, callback) => durableDo(name, callback) as Promise<Awaited<ReturnType<typeof callback>>>,
    sleep: (name, duration) => step.sleep(name, duration as never),
  }
}

export class IngestWorkflow extends WorkflowEntrypoint<Env, IngestWorkflowParams> {
  async run(event: WorkflowEvent<IngestWorkflowParams>, step: WorkflowStep) {
    const params = ingestWorkflowParamsSchema.parse(event.payload)
    await runIngestWorkflow({
      params,
      db: createDb(this.env.DB),
      step: asIngestStep(step),
      env: {
        ENVIRONMENT: this.env.ENVIRONMENT,
        ALLOW_INSECURE_AUTH_BYPASS: this.env.ALLOW_INSECURE_AUTH_BYPASS,
        CURSOR_API_KEY: this.env.CURSOR_API_KEY,
      },
      maxPolls: 20,
      pollSleep: '15 seconds',
    })
  }
}
