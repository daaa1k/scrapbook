import { describe, expect, it } from 'vitest'
import {
  formatNotebookUpdatedAt,
  notebookDeleteConfirmMessage,
  notebookIdSchema,
  parseNotebookPageSearch,
  redirectFromSourceDetail,
  redirectFromSourcesIndex,
} from '../src/domain/organization'

describe('notebook page search and redirects', () => {
  const notebookId = notebookIdSchema.parse('550e8400-e29b-41d4-a716-446655440000')

  it('parses optional sourceId on the notebook page', () => {
    expect(parseNotebookPageSearch({ sourceId: 'src-1' })).toEqual({ sourceId: 'src-1' })
    expect(parseNotebookPageSearch({ sourceId: '  src-1  ' })).toEqual({ sourceId: 'src-1' })
    expect(parseNotebookPageSearch({ sourceId: '' })).toEqual({ sourceId: undefined })
    expect(parseNotebookPageSearch({})).toEqual({ sourceId: undefined })
    expect(parseNotebookPageSearch(null)).toEqual({ sourceId: undefined })
  })

  it('redirects the old sources index to a notebook or home', () => {
    expect(redirectFromSourcesIndex({})).toEqual({ to: '/' })
    expect(redirectFromSourcesIndex({ notebookId, sourceId: 'src-1' })).toEqual({
      to: '/notebooks/$notebookId',
      params: { notebookId },
      search: { sourceId: 'src-1' },
    })
  })

  it('redirects the old source detail to its notebook', () => {
    expect(redirectFromSourceDetail(undefined, 'src-1')).toEqual({ to: '/' })
    expect(redirectFromSourceDetail(notebookId, 'src-1')).toEqual({
      to: '/notebooks/$notebookId',
      params: { notebookId },
      search: { sourceId: 'src-1' },
    })
  })

  it('formats relative update times in Japanese', () => {
    const now = 1_700_000_000_000
    expect(formatNotebookUpdatedAt(now - 30_000, now)).toBe('たった今')
    expect(formatNotebookUpdatedAt(now - 120_000, now)).toBe('2分前')
    expect(formatNotebookUpdatedAt(now - 7_200_000, now)).toBe('2時間前')
  })

  it('names permanent delete consequences in the confirm message', () => {
    expect(notebookDeleteConfirmMessage('研究')).toContain('研究')
    expect(notebookDeleteConfirmMessage('研究')).toContain('PDF原本')
  })
})
