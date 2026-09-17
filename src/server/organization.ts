import { and, count, desc, eq } from 'drizzle-orm'
import { notebooks, sources, sourceTags } from '~/db/schema'
import type { AppDb } from '~/db/types'
import { canStartCursorJob, jobStatusSchema } from '~/domain/jobs'
import {
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
import type { AssetsPort } from '~/server/ingest/pdf'

type OrganizationSourcePatch = { notebookId: NotebookId } | { memo: SourceMemo }

const ACK: OrganizationMutationAck = { ok: true }

function nowMs(): number {
  return Date.now()
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed/i.test(message)
}

async function notebookById(db: AppDb, notebookId: NotebookId) {
  const rows = await db.select().from(notebooks).where(eq(notebooks.id, notebookId)).limit(1)
  return rows[0] ?? null
}

async function notebookByTitle(db: AppDb, title: NotebookTitle) {
  const rows = await db.select().from(notebooks).where(eq(notebooks.title, title)).limit(1)
  return rows[0] ?? null
}

async function sourceExists(db: AppDb, sourceId: string): Promise<boolean> {
  const rows = await db.select({ id: sources.id }).from(sources).where(eq(sources.id, sourceId)).limit(1)
  return Boolean(rows[0])
}

export async function assertNotebookExists(db: AppDb, notebookId: NotebookId): Promise<void> {
  const row = await notebookById(db, notebookId)
  if (!row) throw new Error('notebook_not_found')
}

export async function touchNotebookUpdatedAt(
  db: AppDb,
  notebookId: NotebookId,
  ts = nowMs(),
): Promise<void> {
  await db.update(notebooks).set({ updatedAt: ts }).where(eq(notebooks.id, notebookId))
}

export async function touchNotebookForSource(
  db: AppDb,
  sourceId: string,
  ts = nowMs(),
): Promise<void> {
  const rows = await db
    .select({ notebookId: sources.notebookId })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1)
  const notebookId = rows[0]?.notebookId
  if (!notebookId) return
  await touchNotebookUpdatedAt(db, notebookIdSchema.parse(notebookId), ts)
}

export async function createNotebook(db: AppDb, title: NotebookTitle): Promise<OrganizationMutationAck> {
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

export async function deleteNotebook(
  db: AppDb,
  notebookId: NotebookId,
  assets?: AssetsPort,
): Promise<OrganizationMutationAck> {
  const row = await notebookById(db, notebookId)
  if (!row) return ACK
  const { deleteSource, latestJobForSource } = await import('~/server/ingest/register')
  const sourceRows = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.notebookId, notebookId))
  for (const source of sourceRows) {
    const latest = await latestJobForSource(db, source.id)
    const latestStatus = latest ? jobStatusSchema.parse(latest.status) : null
    if (!canStartCursorJob(latestStatus)) {
      throw new Error('notebook_in_progress')
    }
  }
  for (const source of sourceRows) {
    await deleteSource(db, source.id, assets)
  }
  await db.delete(notebooks).where(eq(notebooks.id, notebookId))
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
  const currentRows = await db
    .select({ notebookId: sources.notebookId })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .limit(1)
  const currentNotebookId = notebookIdSchema.parse(currentRows[0]!.notebookId)
  if ('notebookId' in patch) {
    const target = await notebookById(db, patch.notebookId)
    if (!target) throw new Error('notebook_not_found')
    await db
      .update(sources)
      .set({ notebookId: patch.notebookId, updatedAt: ts })
      .where(eq(sources.id, sourceId))
    await touchNotebookUpdatedAt(db, patch.notebookId, ts)
    if (currentNotebookId !== patch.notebookId) {
      await touchNotebookUpdatedAt(db, currentNotebookId, ts)
    }
    return ACK
  }
  await db.update(sources).set({ memo: patch.memo, updatedAt: ts }).where(eq(sources.id, sourceId))
  await touchNotebookUpdatedAt(db, currentNotebookId, ts)
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

export async function readOrganizationCatalog(db: AppDb): Promise<OrganizationCatalog> {
  const notebookRows = await db
    .select({
      id: notebooks.id,
      title: notebooks.title,
      createdAt: notebooks.createdAt,
      updatedAt: notebooks.updatedAt,
      sourceCount: count(sources.id),
    })
    .from(notebooks)
    .leftJoin(sources, eq(sources.notebookId, notebooks.id))
    .groupBy(notebooks.id)
    .orderBy(desc(notebooks.updatedAt), desc(notebooks.createdAt))
  const tagRows = await db
    .selectDistinct({ tagName: sourceTags.tagName })
    .from(sourceTags)
    .orderBy(sourceTags.tagName)

  return organizationCatalogSchema.parse({
    notebooks: notebookRows.map((row) => ({
      id: notebookIdSchema.parse(row.id),
      title: notebookTitleSchema.parse(row.title),
      sourceCount: Number(row.sourceCount),
      updatedAt: row.updatedAt,
    })),
    tags: tagRows.map((row) => tagNameSchema.parse(row.tagName)),
  })
}

export async function applyOrganizationCommand(
  db: AppDb,
  command: OrganizationCommand,
  assets?: AssetsPort,
): Promise<OrganizationMutationAck> {
  switch (command.type) {
    case 'create-notebook':
      return createNotebook(db, command.title)
    case 'rename-notebook':
      return renameNotebook(db, command.notebookId, command.title)
    case 'delete-notebook':
      return deleteNotebook(db, command.notebookId, assets)
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
