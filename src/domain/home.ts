import type { AsyncListView } from '~/domain/async-view'
import type { OrganizationCatalog } from '~/domain/organization'

export const HOME_EMPTY_TITLE = 'ノートはまだありません'
export const HOME_EMPTY_DESCRIPTION =
  'URL、PDF、本文の貼り付けからソースを集め、要約と質問ができます。'
export const HOME_CATALOG_LOADING_LABEL = 'ノート一覧を読み込み中…'
export const HOME_SEARCH_EMPTY_TITLE = '一致するノートはありません'

export type HomeCreateCtaPlacement = 'header' | 'empty' | 'none'
export type HomeNotebookSort = 'updated' | 'name'

export type HomeNotebookSummary = OrganizationCatalog['notebooks'][number]

export function homeCreateCtaPlacement(view: AsyncListView<unknown>): HomeCreateCtaPlacement {
  switch (view.status) {
    case 'empty':
      return 'empty'
    case 'error':
      return 'none'
    case 'loading':
    case 'ready':
      return 'header'
    default: {
      const _never: never = view
      return _never
    }
  }
}

export function filterHomeNotebooks(
  items: readonly HomeNotebookSummary[],
  q: string,
): HomeNotebookSummary[] {
  const needle = q.trim().toLocaleLowerCase('ja')
  if (needle === '') return [...items]
  return items.filter((notebook) => notebook.title.toLocaleLowerCase('ja').includes(needle))
}

export function sortHomeNotebooks(
  items: readonly HomeNotebookSummary[],
  sort: HomeNotebookSort,
): HomeNotebookSummary[] {
  const next = [...items]
  if (sort === 'name') {
    next.sort((a, b) => {
      const byTitle = a.title.localeCompare(b.title, 'ja')
      if (byTitle !== 0) return byTitle
      return b.updatedAt - a.updatedAt
    })
    return next
  }
  next.sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt
    return a.title.localeCompare(b.title, 'ja')
  })
  return next
}

export function presentHomeNotebooks(
  items: readonly HomeNotebookSummary[],
  q: string,
  sort: HomeNotebookSort,
): HomeNotebookSummary[] {
  return sortHomeNotebooks(filterHomeNotebooks(items, q), sort)
}
