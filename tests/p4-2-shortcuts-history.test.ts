import { describe, expect, it } from 'vitest'
import {
  isModEnter,
  isShortcutHelpKey,
  isTypingTarget,
  sourceNavDirection,
} from '../src/domain/shortcuts'
import {
  filterQaTurnsByQuery,
  qaTurnsCollapsed,
  qaUndoIsActive,
  QA_UNDO_WINDOW_MS,
} from '../src/domain/qa-history'
import {
  memoDraftStorageKey,
  shouldOfferMemoDraftRestore,
} from '../src/domain/memo-draft-storage'

describe('shortcuts', () => {
  it('detects mod+enter and source nav keys', () => {
    expect(isModEnter({ key: 'Enter', metaKey: true, ctrlKey: false })).toBe(true)
    expect(isModEnter({ key: 'Enter', metaKey: false, ctrlKey: false })).toBe(false)
    expect(sourceNavDirection({ key: 'j', metaKey: false, ctrlKey: false, altKey: false })).toBe(
      'next',
    )
    expect(sourceNavDirection({ key: 'k', metaKey: false, ctrlKey: false, altKey: false })).toBe(
      'prev',
    )
    expect(isShortcutHelpKey({ key: '?', metaKey: false, ctrlKey: false, altKey: false })).toBe(true)
  })

  it('treats form fields as typing targets', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false)
    expect(isTypingTarget({ isContentEditable: true })).toBe(true)
  })
})

describe('qa history helpers', () => {
  const turns = [
    { question: '要点は', answer: 'A' },
    { question: '注意点は', answer: 'B' },
    { question: '例は', answer: null },
    { question: 'まとめ', answer: 'C' },
  ]

  it('filters by query', () => {
    expect(filterQaTurnsByQuery(turns, '注意').map((t) => t.question)).toEqual(['注意点は'])
  })

  it('collapses older turns', () => {
    expect(qaTurnsCollapsed(turns, true, 2)).toEqual({
      visible: turns.slice(0, 2),
      hiddenCount: 2,
    })
  })

  it('tracks undo window', () => {
    const undo = { id: '1', question: 'q', answer: null, canDelete: true, citations: [], expiresAt: 1000 }
    expect(qaUndoIsActive(undo, 500)).toBe(true)
    expect(qaUndoIsActive(undo, 1000)).toBe(false)
    expect(QA_UNDO_WINDOW_MS).toBeGreaterThan(0)
  })
})

describe('memo draft storage', () => {
  it('builds keys and restore offer', () => {
    expect(memoDraftStorageKey('abc')).toBe('scrapbook-memo-draft:abc')
    expect(shouldOfferMemoDraftRestore('saved', 'local', true)).toBe(true)
    expect(shouldOfferMemoDraftRestore('saved', 'saved', true)).toBe(false)
    expect(shouldOfferMemoDraftRestore('saved', 'local', false)).toBe(false)
  })
})
