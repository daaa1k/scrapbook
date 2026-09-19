import type { AsyncListView } from '~/domain/async-view'

export const HOME_EMPTY_TITLE = 'ノートはまだありません'
export const HOME_EMPTY_DESCRIPTION =
  'URL、PDF、本文の貼り付けからソースを集め、要約と質問ができます。'
export const HOME_CATALOG_LOADING_LABEL = 'ノート一覧を読み込み中…'

export type HomeCreateCtaPlacement = 'header' | 'empty' | 'none'

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
