import type { AppDb } from '../../src/db/types'
import {
  notebookIdSchema,
  organizationCommandSchema,
  type NotebookId,
} from '../../src/domain/organization'
import { applyOrganizationCommand } from '../../src/server/organization'

export async function seedNotebook(db: AppDb, title = '研究'): Promise<NotebookId> {
  const ack = await applyOrganizationCommand(
    db,
    organizationCommandSchema.parse({ type: 'create-notebook', title }),
  )
  return notebookIdSchema.parse(ack.notebookId)
}
