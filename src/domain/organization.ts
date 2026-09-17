import { z } from 'zod'

export const notebookIdSchema = z.uuid().brand<'NotebookId'>()
export type NotebookId = z.infer<typeof notebookIdSchema>

export const notebookTitleSchema = z.string().trim().min(1).max(100).brand<'NotebookTitle'>()
export type NotebookTitle = z.infer<typeof notebookTitleSchema>

export const UNTITLED_NOTEBOOK_TITLE = '無題のノート'
const NOTEBOOK_TITLE_MAX = 100

export const notebookTargetSchema = z.union([notebookIdSchema, z.literal('new')])
export type NotebookTarget = z.infer<typeof notebookTargetSchema>

export function notebookTitleFromHint(hint: string): NotebookTitle {
  const trimmed = hint.trim() || UNTITLED_NOTEBOOK_TITLE
  return notebookTitleSchema.parse(trimmed.slice(0, NOTEBOOK_TITLE_MAX))
}

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

export type NotebookPageSearch = {
  sourceId?: string
}

export type NotebookAppLocation =
  | { to: '/' }
  | {
      to: '/notebooks/$notebookId'
      params: { notebookId: NotebookId }
      search: NotebookPageSearch
    }

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function parseNotebookPageSearch(search: unknown): NotebookPageSearch {
  const bag = z.object({ sourceId: z.unknown().optional() }).safeParse(search)
  // Router merges this onto the URL bag, so dropped keys must be explicit undefined.
  if (!bag.success) return { sourceId: undefined }
  return { sourceId: optionalTrimmedString(bag.data.sourceId) }
}

export function parseSourcesPageSearch(search: unknown): SourcesPageSearch {
  const bag = z
    .object({
      notebookId: z.unknown().optional(),
      sourceId: z.unknown().optional(),
    })
    .safeParse(search)
  if (!bag.success) return { notebookId: undefined, sourceId: undefined }
  const notebookId = notebookIdSchema.safeParse(bag.data.notebookId)
  if (!notebookId.success) return { notebookId: undefined, sourceId: undefined }
  return { notebookId: notebookId.data, sourceId: optionalTrimmedString(bag.data.sourceId) }
}

export function redirectFromSourcesIndex(search: SourcesPageSearch): NotebookAppLocation {
  if (!search.notebookId) return { to: '/' }
  return {
    to: '/notebooks/$notebookId',
    params: { notebookId: search.notebookId },
    search: { sourceId: search.sourceId },
  }
}

export function redirectFromSourceDetail(
  notebookId: NotebookId | undefined,
  sourceId: string,
): NotebookAppLocation {
  if (!notebookId) return { to: '/' }
  return {
    to: '/notebooks/$notebookId',
    params: { notebookId },
    search: { sourceId },
  }
}

export function formatNotebookUpdatedAt(updatedAt: number, now = Date.now()): string {
  const delta = now - updatedAt
  if (delta < 60_000) return 'たった今'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}分前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}時間前`
  if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)}日前`
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium' }).format(new Date(updatedAt))
}

export function notebookDeleteConfirmMessage(title: string): string {
  return `「${title}」を削除します。ソース、要約、Q&A、メモ、PDF原本は完全に削除され、元に戻せません。`
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
