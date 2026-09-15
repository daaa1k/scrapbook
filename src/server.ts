import handler from '@tanstack/react-start/server-entry'

export { IngestWorkflow } from './workflows/ingest'

export default {
  fetch: handler.fetch,
}
