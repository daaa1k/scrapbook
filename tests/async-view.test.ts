import { describe, expect, it } from 'vitest'
import { asyncListView, asyncResourceView } from '../src/domain/async-view'

describe('asyncResourceView', () => {
  it('keeps cached data as ready during a refetch or a later error', () => {
    expect(
      asyncResourceView({ data: { id: 'a' }, isError: false, isFetching: true }),
    ).toEqual({ status: 'ready', data: { id: 'a' } })
    expect(
      asyncResourceView({ data: { id: 'a' }, isError: true, isFetching: false }),
    ).toEqual({ status: 'ready', data: { id: 'a' } })
  })

  it('is loading until the first result, including a retry after error', () => {
    expect(asyncResourceView({ data: undefined, isError: false, isFetching: false })).toEqual({
      status: 'loading',
    })
    expect(asyncResourceView({ data: undefined, isError: false, isFetching: true })).toEqual({
      status: 'loading',
    })
    expect(asyncResourceView({ data: undefined, isError: true, isFetching: true })).toEqual({
      status: 'loading',
    })
  })

  it('is error only when there is no data and nothing is fetching', () => {
    expect(asyncResourceView({ data: undefined, isError: true, isFetching: false })).toEqual({
      status: 'error',
    })
  })
})

describe('asyncListView', () => {
  it('treats a successful empty array as empty, not loading', () => {
    expect(asyncListView({ data: [], isError: false, isFetching: false })).toEqual({
      status: 'empty',
    })
  })

  it('does not treat missing data as empty', () => {
    expect(asyncListView({ data: undefined, isError: false, isFetching: false })).toEqual({
      status: 'loading',
    })
    expect(asyncListView({ data: undefined, isError: true, isFetching: false })).toEqual({
      status: 'error',
    })
  })

  it('returns the items when the list is present', () => {
    expect(asyncListView({ data: ['研究'], isError: false, isFetching: false })).toEqual({
      status: 'ready',
      items: ['研究'],
    })
  })
})
