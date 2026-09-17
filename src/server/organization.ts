import { and, count, desc, eq, sql } from 'drizzle-orm'
import { notebooks, sources, sourceTags } from '~/db/schema'
import type { AppDb } from '~/db/types'
import {
  notebookIdSchema,
  notebookTitleFromHint,
  notebookTitleSchema,
  organizationCatalogSchema,
  isPlaceholderNotebookTitle,
  tagNameSchema,
  type NotebookId,
  type NotebookTarget,
  type NotebookTitle,
  type OrganizationCommand,
  type OrganizationMutationAck,
  type OrganizationCatalog,
  type SourceMemo,
  type TagName,
} from '~/domain/organization'
import { isUniqueConstraintError } from '~/lib/sqlite-errors'

type OrganizationSourcePatch = { notebookId: NotebookId } | { memo: SourceMemo }

const ACK: OrganizationMutationAck = { ok: true }
const NOTEBOOK_TITLE_MAX = 100

function nowMs(): number {
  return Date.now()
}

function titleWithSuffix(base: NotebookTitle, n: number): NotebookTitle {
  if (n === 1) return base
  const suffix = ` (${n})`
  return notebookTitleSchema.parse(`${base.slice(0, NOTEBOOK_TITLE_MAX - suffix.length)}${suffix}`)
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

export async function withNotebookTarget<T>(
  db: AppDb,
  target: NotebookTarget,
  titleHint: string,
  work: (notebookId: NotebookId) => Promise<T>,
): Promise<T> {
  if (target !== 'new') {
    const row = await notebookById(db, target)
    if (!row) throw new Error('notebook_not_found')
    return work(target)
  }

  const base = notebookTitleFromHint(titleHint)
  const notebookId = notebookIdSchema.parse(crypto.randomUUID())
  const ts = nowMs()
  let inserted = false
  for (let n = 1; n < 10_000; n += 1) {
    try {
      await db.insert(notebooks).values({
        id: notebookId,
        title: titleWithSuffix(base, n),
        createdAt: ts,
        updatedAt: ts,
      })
      inserted = true
      break
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
    }
  }
  if (!inserted) throw new Error('notebook_title_taken')

  try {
    return await work(notebookId)
  } catch (error) {
    await db.delete(notebooks).where(
      and(
        eq(notebooks.id, notebookId),
        sql`not exists (select 1 from sources where notebook_id = ${notebookId})`,
      ),
    )
    throw error
  }
}

export async function applyFirstSourceNotebookTitle(
  db: AppDb,
  notebookId: NotebookId,
  candidateTitle: string,
): Promise<boolean> {
  const trimmed = candidateTitle.trim()
  if (!trimmed) return false

  const countRows = await db
    .select({ value: count() })
    .from(sources)
    .where(eq(sources.notebookId, notebookId))
  if (Number(countRows[0]?.value ?? 0) !== 1) return false

  const row = await notebookById(db, notebookId)
  if (!row) throw new Error('notebook_not_found')
  if (!isPlaceholderNotebookTitle(row.title)) return false

  const base = notebookTitleFromHint(trimmed)
  if (isPlaceholderNotebookTitle(base)) return false

  for (let n = 1; n < 10_000; n += 1) {
    const next = titleWithSuffix(base, n)
    try {
      await db
        .update(notebooks)
        .set({ title: next, updatedAt: nowMs() })
        .where(eq(notebooks.id, notebookId))
      return true
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
    }
  }
  throw new Error('notebook_title_taken')
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

const catalogUpdatedAt = sql<number>`max(
  ${notebooks.updatedAt},
  coalesce(max(${sources.updatedAt}), 0),
  coalesce(
    (
      select max(q.updated_at)
      from qa_answers q
      join sources s2 on s2.id = q.source_id
      where s2.notebook_id = ${notebooks.id}
    ),
    0
  )
)`

export async function readOrganizationCatalog(db: AppDb): Promise<OrganizationCatalog> {
  const notebookRows = await db
    .select({
      id: notebooks.id,
      title: notebooks.title,
      createdAt: notebooks.createdAt,
      updatedAt: catalogUpdatedAt,
      sourceCount: count(sources.id),
    })
    .from(notebooks)
    .leftJoin(sources, eq(sources.notebookId, notebooks.id))
    .groupBy(notebooks.id)
    .orderBy(desc(catalogUpdatedAt), desc(notebooks.createdAt))
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
): Promise<OrganizationMutationAck> {
  switch (command.type) {
    case 'create-notebook':
      return createNotebook(db, command.title)
    case 'rename-notebook':
      return renameNotebook(db, command.notebookId, command.title)
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
