import { z } from 'zod'
import type { SourceListItem } from '~/domain/source-views'

export const sourceListSortSchema = z.enum(['created', 'updated', 'title'])
export type SourceListSort = z.infer<typeof sourceListSortSchema>

export const SOURCE_LIST_SORT_DEFAULT: SourceListSort = 'created'

export const SOURCE_LIST_SORT_LABELS: Record<SourceListSort, string> = {
  created: '追加順',
  updated: '更新順',
  title: 'タイトル順',
}

export const QUESTION_EXAMPLES = [
  'このソースの要点を3つ挙げてください',
  '初心者向けにかみ砕いて説明してください',
  '反論や注意点はありますか？',
] as const

export const COPY_SUCCESS_ANNOUNCEMENT = 'コピーしました'
export const COPY_FAILURE_ANNOUNCEMENT = 'コピーできませんでした'

export function sortSourceListItems(
  items: readonly SourceListItem[],
  sort: SourceListSort,
): SourceListItem[] {
  const next = [...items]
  if (sort === 'title') {
    next.sort((a, b) => {
      const left = (a.title ?? a.url ?? a.id).localeCompare(b.title ?? b.url ?? b.id, 'ja')
      if (left !== 0) return left
      return b.createdAt - a.createdAt
    })
    return next
  }
  if (sort === 'updated') {
    next.sort((a, b) => {
      if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
      return b.createdAt - a.createdAt
    })
    return next
  }
  next.sort((a, b) => {
    if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt
    return (b.title ?? '').localeCompare(a.title ?? '', 'ja')
  })
  return next
}

export function sourceListSearchEmptyCopy(q: string): string {
  const trimmed = q.trim()
  if (trimmed === '') return 'ソースはまだありません'
  return `「${trimmed}」に一致するソースはありません`
}
