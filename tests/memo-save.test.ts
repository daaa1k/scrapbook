import { describe, expect, it } from 'vitest'
import {
  applyServerMemo,
  discardedMemoSession,
  isLeavingNotebook,
  isLeavingMemoSource,
  memoNeedsLeaveGuard,
  memoStateAfterSave,
  shouldSaveMemo,
  shouldWriteMemoDraft,
  type MemoSession,
} from '../src/domain/memo-save'

const idle: MemoSession = {
  sourceId: 'src-a',
  draft: 'saved text',
  lastSaved: 'saved text',
  saveState: 'idle',
}

describe('shouldSaveMemo', () => {
  it('skips save when draft matches the last saved value', () => {
    expect(shouldSaveMemo('hello', 'hello')).toBe(false)
    expect(shouldSaveMemo('', null)).toBe(false)
    expect(shouldSaveMemo('', '')).toBe(false)
  })

  it('saves when draft differs from the last saved value', () => {
    expect(shouldSaveMemo('hello', '')).toBe(true)
    expect(shouldSaveMemo('hello', null)).toBe(true)
    expect(shouldSaveMemo('next', 'prev')).toBe(true)
  })
})

describe('shouldWriteMemoDraft', () => {
  it('persists pending edits but leaves clean local drafts for restore decisions', () => {
    expect(shouldWriteMemoDraft('idle')).toBe(false)
    expect(shouldWriteMemoDraft('saved')).toBe(false)
    expect(shouldWriteMemoDraft('dirty')).toBe(true)
    expect(shouldWriteMemoDraft('saving')).toBe(true)
    expect(shouldWriteMemoDraft('error')).toBe(true)
  })
})

describe('memoStateAfterSave', () => {
  it('keeps later edits dirty when an older save succeeds', () => {
    expect(memoStateAfterSave('AB', 'A')).toBe('dirty')
    expect(shouldWriteMemoDraft(memoStateAfterSave('AB', 'A'))).toBe(true)
  })

  it('marks only the acknowledged draft saved', () => {
    expect(memoStateAfterSave('AB', 'AB')).toBe('saved')
  })
})

describe('applyServerMemo', () => {
  it('adopts serverMemo when the source id changes even if the draft is dirty', () => {
    const dirty: MemoSession = {
      sourceId: 'src-a',
      draft: 'local typing',
      lastSaved: 'saved text',
      saveState: 'dirty',
    }
    expect(applyServerMemo(dirty, { sourceId: 'src-b', serverMemo: 'other source' })).toEqual({
      sourceId: 'src-b',
      draft: 'other source',
      lastSaved: 'other source',
      saveState: 'idle',
    })
  })

  it('adopts serverMemo when idle and the draft matches lastSaved', () => {
    expect(applyServerMemo(idle, { sourceId: 'src-a', serverMemo: 'from server' })).toEqual({
      sourceId: 'src-a',
      draft: 'from server',
      lastSaved: 'from server',
      saveState: 'idle',
    })
  })

  it('keeps a dirty draft when query invalidation refreshes the same source', () => {
    const dirty: MemoSession = {
      sourceId: 'src-a',
      draft: 'local typing',
      lastSaved: 'saved text',
      saveState: 'dirty',
    }
    expect(applyServerMemo(dirty, { sourceId: 'src-a', serverMemo: 'saved text' })).toBe(dirty)
  })

  it('keeps a save-error draft when serverMemo refreshes', () => {
    const failed: MemoSession = {
      sourceId: 'src-a',
      draft: 'unsaved',
      lastSaved: 'saved text',
      saveState: 'error',
    }
    expect(applyServerMemo(failed, { sourceId: 'src-a', serverMemo: 'saved text' })).toBe(failed)
  })

  it('keeps a draft after save while saveState is saved', () => {
    const saved: MemoSession = {
      sourceId: 'src-a',
      draft: 'typed more during round trip',
      lastSaved: 'just saved',
      saveState: 'saved',
    }
    expect(applyServerMemo(saved, { sourceId: 'src-a', serverMemo: 'just saved' })).toBe(saved)
  })

  it('returns the same session when idle, clean, and serverMemo already matches', () => {
    expect(applyServerMemo(idle, { sourceId: 'src-a', serverMemo: 'saved text' })).toBe(idle)
  })
})

describe('memoNeedsLeaveGuard', () => {
  it('guards dirty, saving, and error sessions', () => {
    expect(memoNeedsLeaveGuard({ draft: 'new', lastSaved: 'old', saveState: 'dirty' })).toBe(true)
    expect(memoNeedsLeaveGuard({ draft: 'old', lastSaved: 'old', saveState: 'saving' })).toBe(true)
    expect(memoNeedsLeaveGuard({ draft: 'new', lastSaved: 'old', saveState: 'error' })).toBe(true)
  })

  it('guards a saved label when the draft has already moved on', () => {
    expect(
      memoNeedsLeaveGuard({ draft: 'newer', lastSaved: 'just saved', saveState: 'saved' }),
    ).toBe(true)
  })

  it('skips idle or saved sessions whose draft matches lastSaved', () => {
    expect(memoNeedsLeaveGuard({ draft: 'ok', lastSaved: 'ok', saveState: 'idle' })).toBe(false)
    expect(memoNeedsLeaveGuard({ draft: 'ok', lastSaved: 'ok', saveState: 'saved' })).toBe(false)
    expect(memoNeedsLeaveGuard({ draft: '', lastSaved: '', saveState: 'idle' })).toBe(false)
  })
})

describe('discardedMemoSession', () => {
  it('restores lastSaved and returns to idle', () => {
    expect(
      discardedMemoSession({
        sourceId: 'src-a',
        draft: 'unsaved',
        lastSaved: 'kept',
        saveState: 'error',
      }),
    ).toEqual({
      sourceId: 'src-a',
      draft: 'kept',
      lastSaved: 'kept',
      saveState: 'idle',
    })
  })
})

describe('isLeavingNotebook', () => {
  it('treats a sourceId-only change as staying in the notebook', () => {
    expect(isLeavingNotebook('nb-1', 'nb-1')).toBe(false)
  })

  it('treats home, another notebook, and missing ids as leaving', () => {
    expect(isLeavingNotebook('nb-1', undefined)).toBe(true)
    expect(isLeavingNotebook('nb-1', 'nb-2')).toBe(true)
    expect(isLeavingNotebook(undefined, 'nb-1')).toBe(true)
  })
})

describe('isLeavingMemoSource', () => {
  it('guards source history changes within a notebook', () => {
    expect(isLeavingMemoSource(
      { notebookId: 'notebook', sourceId: 'a' },
      { notebookId: 'notebook', sourceId: 'b' },
    )).toBe(true)
    expect(isLeavingMemoSource(
      { notebookId: 'notebook', sourceId: 'a' },
      { notebookId: 'notebook', sourceId: 'a' },
    )).toBe(false)
    expect(isLeavingMemoSource(
      { notebookId: 'notebook', sourceId: 'a' },
      { notebookId: 'other', sourceId: 'a' },
    )).toBe(true)
  })
})
