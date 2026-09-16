import { listSourceViews } from '~/server/source-views'
import type { AppDb } from '~/db/types'

export async function findSourcesByQuery(db: AppDb, q: string) {
  return listSourceViews(db, { q, notebookId: null, tagName: null })
}
