export type QuerySnapshot<T> = {
  data: T | undefined
  isError: boolean
  isFetching: boolean
}

export type AsyncResourceView<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T }

export type AsyncListView<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; items: T[] }

export function asyncResourceView<T>(snapshot: QuerySnapshot<T>): AsyncResourceView<T> {
  if (snapshot.data !== undefined) return { status: 'ready', data: snapshot.data }
  if (snapshot.isFetching) return { status: 'loading' }
  if (snapshot.isError) return { status: 'error' }
  return { status: 'loading' }
}

export function asyncListView<T>(snapshot: QuerySnapshot<readonly T[]>): AsyncListView<T> {
  const resource = asyncResourceView(snapshot)
  if (resource.status !== 'ready') return resource
  if (resource.data.length === 0) return { status: 'empty' }
  return { status: 'ready', items: [...resource.data] }
}
