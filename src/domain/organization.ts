import { z } from 'zod'

export const notebookIdSchema = z.uuid().brand<'NotebookId'>()
export type NotebookId = z.infer<typeof notebookIdSchema>

export const notebookTitleSchema = z.string().trim().min(1).max(100).brand<'NotebookTitle'>()
export type NotebookTitle = z.infer<typeof notebookTitleSchema>

export const UNTITLED_NOTEBOOK_TITLE = '無題のノート'
const NOTEBOOK_TITLE_MAX = 100

export const tagNameSchema = z.string().trim().min(1).max(50).brand<'TagName'>()
export type TagName = z.infer<typeof tagNameSchema>

export const memoEditSchema = z
  .string()
  .max(20_000)
  .transform((value) => (value.trim() === '' ? null : value))
export type SourceMemo = z.output<typeof memoEditSchema>

export const sourceListFilterSchema = z.object({
  q: z.string().trim().max(500),
  notebookId: notebookIdSchema.nullable(),
  tagName: tagNameSchema.nullable(),
})
export type SourceListFilter = z.infer<typeof sourceListFilterSchema>

export const EMPTY_SOURCE_LIST_FILTER: SourceListFilter = {
  q: '',
  notebookId: null,
  tagName: null,
}

export type SourcesPageSearch = {
  notebookId?: NotebookId
  sourceId?: string
}

export function parseSourcesPageSearch(search: unknown): SourcesPageSearch {
  const bag = z
    .object({
      notebookId: z.unknown().optional(),
      sourceId: z.unknown().optional(),
    })
    .safeParse(search)
  // Router merges this onto the URL bag, so dropped keys must be explicit undefined.
  if (!bag.success) return { notebookId: undefined, sourceId: undefined }
  const notebookId = notebookIdSchema.safeParse(bag.data.notebookId)
  if (!notebookId.success) return { notebookId: undefined, sourceId: undefined }
  const sourceId =
    typeof bag.data.sourceId === 'string' && bag.data.sourceId.trim() !== ''
      ? bag.data.sourceId.trim()
      : undefined
  return { notebookId: notebookId.data, sourceId }
}

export function sourceListFilterFromSourcesPageSearch(search: {
  notebookId?: NotebookId
}): SourceListFilter {
  return {
    ...EMPTY_SOURCE_LIST_FILTER,
    notebookId: search.notebookId ?? null,
  }
}

export const notebookRefSchema = z.object({
  id: notebookIdSchema,
  title: notebookTitleSchema,
})
export type NotebookRef = z.infer<typeof notebookRefSchema>

export const notebookSummarySchema = notebookRefSchema.extend({
  sourceCount: z.number().int().nonnegative(),
  updatedAt: z.number().int(),
})

export const organizationCatalogSchema = z.object({
  notebooks: z.array(notebookSummarySchema),
  tags: z.array(tagNameSchema),
})
export type OrganizationCatalog = z.infer<typeof organizationCatalogSchema>

export const sourceOrganizationSchema = z.object({
  notebook: notebookRefSchema,
  tags: z.array(tagNameSchema),
  memo: z.string().max(20_000).nullable(),
})
export type SourceOrganization = z.infer<typeof sourceOrganizationSchema>

export const organizationCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create-notebook'),
    title: notebookTitleSchema,
  }),
  z.object({
    type: z.literal('rename-notebook'),
    notebookId: notebookIdSchema,
    title: notebookTitleSchema,
  }),
  z.object({
    type: z.literal('delete-notebook'),
    notebookId: notebookIdSchema,
  }),
  z.object({
    type: z.literal('move-source'),
    sourceId: z.string().min(1),
    notebookId: notebookIdSchema,
  }),
  z.object({
    type: z.literal('set-memo'),
    sourceId: z.string().min(1),
    memo: memoEditSchema,
  }),
  z.object({
    type: z.literal('attach-tag'),
    sourceId: z.string().min(1),
    tagName: tagNameSchema,
  }),
  z.object({
    type: z.literal('detach-tag'),
    sourceId: z.string().min(1),
    tagName: tagNameSchema,
  }),
])
export type OrganizationCommand = z.output<typeof organizationCommandSchema>

export const organizationMutationAckSchema = z.object({
  ok: z.literal(true),
  notebookId: notebookIdSchema.optional(),
})
export type OrganizationMutationAck = z.infer<typeof organizationMutationAckSchema>

export type HomeCreateFlow =
  | { status: 'idle' }
  | { status: 'awaiting-source'; notebookId: NotebookId }

export function notebookTitleHint(input: {
  sourceTitle?: string | null
  pdfFilename?: string | null
  url?: string | null
}): string {
  const sourceTitle = input.sourceTitle?.trim()
  if (sourceTitle) return sourceTitle
  const pdfFilename = input.pdfFilename?.trim()
  if (pdfFilename) return pdfFilename
  const rawUrl = input.url?.trim()
  if (rawUrl) {
    try {
      const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '')
      if (host) return host
    } catch {
      // Invalid URL falls through to the untitled default.
    }
  }
  return UNTITLED_NOTEBOOK_TITLE
}

export function uniqueNotebookTitle(
  preferred: string,
  existingTitles: readonly string[],
): NotebookTitle {
  const existing = new Set(existingTitles)
  const trimmed = preferred.trim() || UNTITLED_NOTEBOOK_TITLE
  const base = trimmed.slice(0, NOTEBOOK_TITLE_MAX)
  if (!existing.has(base)) return notebookTitleSchema.parse(base)
  for (let n = 2; n < 10_000; n += 1) {
    const suffix = ` (${n})`
    const title = `${base.slice(0, NOTEBOOK_TITLE_MAX - suffix.length)}${suffix}`
    if (!existing.has(title)) return notebookTitleSchema.parse(title)
  }
  throw new Error('notebook_title_taken')
}
