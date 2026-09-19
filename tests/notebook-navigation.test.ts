import { describe, expect, it } from 'vitest'
import {
  formatNotebookUpdatedAt,
  notebookIdSchema,
  notebookUpdatedAtLabel,
  parseNotebookPageSearch,
  parseSourcesPageSearch,
  redirectFromSourceDetail,
  redirectFromSourcesIndex,
} from '../src/domain/organization'

const notebookId = notebookIdSchema.parse('550e8400-e29b-41d4-a716-446655440000')

describe('parseNotebookPageSearch', () => {
  it('keeps a trimmed sourceId and drops empty values', () => {
    expect(parseNotebookPageSearch({ sourceId: 'src-1' })).toEqual({ sourceId: 'src-1' })
    expect(parseNotebookPageSearch({ sourceId: '  src-1  ' })).toEqual({ sourceId: 'src-1' })
    expect(parseNotebookPageSearch({ sourceId: '' })).toEqual({ sourceId: undefined })
    expect(parseNotebookPageSearch({ sourceId: '   ' })).toEqual({ sourceId: undefined })
    expect(parseNotebookPageSearch({})).toEqual({ sourceId: undefined })
    expect(parseNotebookPageSearch(null)).toEqual({ sourceId: undefined })
  })
})

describe('legacy source URL redirects', () => {
  it('sends /sources with a notebookId to that notebook', () => {
    expect(redirectFromSourcesIndex({ notebookId, sourceId: 'src-1' })).toEqual({
      to: '/notebooks/$notebookId',
      params: { notebookId },
      search: { sourceId: 'src-1' },
    })
    expect(redirectFromSourcesIndex({ notebookId })).toEqual({
      to: '/notebooks/$notebookId',
      params: { notebookId },
      search: { sourceId: undefined },
    })
  })

  it('sends /sources without a notebookId to home', () => {
    expect(redirectFromSourcesIndex({})).toEqual({ to: '/' })
    expect(redirectFromSourcesIndex(parseSourcesPageSearch({ sourceId: 'src-1' }))).toEqual({
      to: '/',
    })
  })

  it('sends a source detail to its notebook when the notebook is known', () => {
    expect(redirectFromSourceDetail(notebookId, 'src-1')).toEqual({
      to: '/notebooks/$notebookId',
      params: { notebookId },
      search: { sourceId: 'src-1' },
    })
    expect(redirectFromSourceDetail(undefined, 'src-1')).toEqual({ to: '/' })
  })
})

describe('formatNotebookUpdatedAt', () => {
  const now = Date.UTC(2026, 8, 17, 12)

  it('uses Japanese relative labels for the last week', () => {
    expect(formatNotebookUpdatedAt(now - 30_000, now)).toBe('たった今')
    expect(formatNotebookUpdatedAt(now - 5 * 60_000, now)).toBe('5分前')
    expect(formatNotebookUpdatedAt(now - 3 * 3_600_000, now)).toBe('3時間前')
    expect(formatNotebookUpdatedAt(now - 2 * 86_400_000, now)).toBe('2日前')
  })

  it('uses a Japanese date after a week', () => {
    expect(formatNotebookUpdatedAt(Date.UTC(2026, 0, 8), now)).toBe('2026年1月8日')
  })

  it('falls back for future and invalid timestamps', () => {
    expect(formatNotebookUpdatedAt(now + 60_000, now)).toBe('たった今')
    expect(formatNotebookUpdatedAt(Number.NaN, now)).toBe('日時不明')
    expect(notebookUpdatedAtLabel(now - 5 * 60_000, now)).toBe('更新 5分前')
  })
})
