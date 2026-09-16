import { and, count, desc, eq, sql } from 'drizzle-orm'
import { notebooks, sources, sourceTags } from '~/db/schema'
import type { AppDb } from '~/db/types'
import {
  INBOX_NOTEBOOK_TITLE,
  notebookIdSchema,
  notebookTitleSchema,
  organizationCatalogSchema,
  tagNameSchema,
  type NotebookId,
  type NotebookTitle,
  type OrganizationCommand,
  type OrganizationMutationAck,
  type OrganizationCatalog,
  type SourceMemo,
  type TagName,
} from '~/domain/organization'

type OrganizationSourcePatch = { notebookId: NotebookId } | { memo: SourceMemo }

const ACK: OrganizationMutationAck = { ok: true }

function nowMs(): number {
  return Date.now()
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed/i.test(message)
}

function isForeignKeyError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /FOREIGN KEY constraint failed/i.test(message)
}

async function notebookById(db: AppDb, notebookId: NotebookId) {
  const rows = await db.select().from(notebooks).where(eq(notebooks.id, notebookId)).limit(1)
  return rows[0] ?? null
}

async function notebookByTitle(db: AppDb, title: NotebookTitle | typeof INBOX_NOTEBOOK_TITLE) {
  const rows = await db.select().from(notebooks).where(eq(notebooks.title, title)).limit(1)
  return rows[0] ?? null
}

async function sourceExists(db: AppDb, sourceId: string): Promise<boolean> {
  const rows = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, sourceId)).limit(1)
  return Boolean(rows[0])
}

async function sourceCountForNotebook(db: AppDb, notebookId: NotebookId): Promise<number> {
  const rows = await db
    .select({ value: count(sources.id) })
    .from(sources)
    .where(eq(sources.notebookId, notebookId))
  return Number(rows[0]?.value ?? 0)
}

async function createNotebook(db: AppDb, title: NotebookTitle): Promise<OrganizationMutationAck> {
  if (title === INBOX_NOTEBOOK_TITLE) {
    throw new Error('notebook_title_reserved')
  }
  const existing = await notebookByTitle(db, title)
  if (existing) {
    return { ok: true, notebookId: notebookIdSchema.parse(existing.id) }
  }
  const id = crypto.randomUUID()
  const ts = nowMs()
  try {
    await db.insert(notebooks).values({
      id,
      title,
      createdAt: ts,
      updatedAt: ts,
    })
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await notebookByTitle(db, title)
      if (raced) return { ok: true, notebookId: notebookIdSchema.parse(raced.id) }
      throw error
    }
    throw error
  }
  return { ok: true, notebookId: notebookIdSchema.parse(id) }
}

async function renameNotebook(
  db: AppDb,
  notebookId: NotebookId,
  title: NotebookTitle,
): Promise<OrganizationMutationAck> {
  const row = await notebookById(db, notebookId)
  if (!row) throw new Error('notebook_not_found')
  if (row.title === INBOX_NOTEBOOK_TITLE) {
    throw new Error('inbox_notebook_immutable')
  }
  if (title === INBOX_NOTEBOOK_TITLE) {
    throw new Error('notebook_title_reserved')
  }
  if (row.title === title) return ACK
  try {
    await db
      .update(notebooks)
      .set({ title, updatedAt: nowMs() })
      .where(eq(notebooks.id, notebookId))
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error('notebook_title_taken')
    throw error
  }
  return ACK
}

async function deleteNotebook(db: AppDb, notebookId: NotebookId): Promise<OrganizationMutationAck> {
  const row = await notebookById(db, notebookId)
  if (!row) return ACK
  if (row.title === INBOX_NOTEBOOK_TITLE) {
    throw new Error('inbox_notebook_immutable')
  }
  if ((await sourceCountForNotebook(db, notebookId)) > 0) {
    throw new Error('notebook_not_empty')
  }
  try {
    await db.delete(notebooks).where(eq(notebooks.id, notebookId))
  } catch (error) {
    if (isForeignKeyError(error)) throw new Error('notebook_not_empty')
    throw error
  }
  return ACK
}

async function patchSourceOrganization(
  db: AppDb,
  sourceId: string,
  patch: OrganizationSourcePatch,
): Promise<OrganizationMutationAck> {
  if (!(await sourceExists(db, sourceId))) {
    throw new Error('source_not_found')
  }
  const ts = nowMs()
  if ('notebookId' in patch) {
    const target = await notebookById(db, patch.notebookId)
    if (!target) throw new Error('notebook_not_found')
    await db
      .update(sources)
      .set({ notebookId: patch.notebookId, updatedAt: ts })
      .where(eq(sources.id, sourceId))
    return ACK
  }
  await db.update(sources).set({ memo: patch.memo, updatedAt: ts }).where(eq(sources.id, sourceId))
  return ACK
}

async function attachTag(db: AppDb, sourceId: string, tagName: TagName): Promise<OrganizationMutationAck> {
  if (!(await sourceExists(db, sourceId))) {
    throw new Error('source_not_found')
  }
  await db.insert(sourceTags).values({ sourceId, tagName }).onConflictDoNothing()
  return ACK
}

async function detachTag(db: AppDb, sourceId: string, tagName: TagName): Promise<OrganizationMutationAck> {
  if (!(await sourceExists(db, sourceId))) {
    throw new Error('source_not_found')
  }
  await db
    .delete(sourceTags)
    .where(and(eq(sourceTags.sourceId, sourceId), eq(sourceTags.tagName, tagName)))
  return ACK
}

export async function ensureInboxNotebook(db: AppDb): Promise<NotebookId> {
  const ts = nowMs()
  await db
    .insert(notebooks)
    .values({
      id: crypto.randomUUID(),
      title: INBOX_NOTEBOOK_TITLE,
      createdAt: ts,
      updatedAt: ts,
    })
    .onConflictDoNothing()
  const row = await notebookByTitle(db, INBOX_NOTEBOOK_TITLE)
  if (!row) {
    throw new Error('inbox_notebook_missing')
  }
  return notebookIdSchema.parse(row.id)
}

export async function readOrganizationCatalog(db: AppDb): Promise<OrganizationCatalog> {
  await ensureInboxNotebook(db)
  const notebookRows = await db
    .select({
      id: notebooks.id,
      title: notebooks.title,
      createdAt: notebooks.createdAt,
      sourceCount: count(sources.id),
    })
    .from(notebooks)
    .leftJoin(sources, eq(sources.notebookId, notebooks.id))
    .groupBy(notebooks.id)
    .orderBy(
      sql`case when ${notebooks.title} = ${INBOX_NOTEBOOK_TITLE} then 0 else 1 end`,
      desc(notebooks.createdAt),
    )
  const tagRows = await db
    .selectDistinct({ tagName: sourceTags.tagName })
    .from(sourceTags)
    .orderBy(sourceTags.tagName)

  return organizationCatalogSchema.parse({
    notebooks: notebookRows.map((row) => ({
      id: notebookIdSchema.parse(row.id),
      title: notebookTitleSchema.parse(row.title),
      isInbox: row.title === INBOX_NOTEBOOK_TITLE,
      sourceCount: Number(row.sourceCount),
    })),
    tags: tagRows.map((row) => tagNameSchema.parse(row.tagName)),
  })
}

export async function applyOrganizationCommand(
  db: AppDb,
  command: OrganizationCommand,
): Promise<OrganizationMutationAck> {
  switch (command.type) {
    case 'create-notebook':
      return createNotebook(db, command.title)
    case 'rename-notebook':
      return renameNotebook(db, command.notebookId, command.title)
    case 'delete-notebook':
      return deleteNotebook(db, command.notebookId)
    case 'move-source':
      return patchSourceOrganization(db, command.sourceId, { notebookId: command.notebookId })
    case 'set-memo':
      return patchSourceOrganization(db, command.sourceId, { memo: command.memo })
    case 'attach-tag':
      return attachTag(db, command.sourceId, command.tagName)
    case 'detach-tag':
      return detachTag(db, command.sourceId, command.tagName)
    default: {
      const exhaustive: never = command
      throw new Error(`unhandled_organization_command:${String(exhaustive)}`)
    }
  }
}
