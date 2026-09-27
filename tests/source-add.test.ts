import { describe, expect, it } from 'vitest'
import {
  emptySourceAddDraft,
  sourceAddCloseIntent,
  sourceAddIsDirty,
  sourceAddMethodAfterTabKey,
  sourceAddPanelIsConcealed,
  sourceAddPasteBodyCount,
  sourceAddPasteBodyIssue,
  sourceAddPasteTitleIssue,
  sourceAddPasteUrlIssue,
  sourceAddPdfIssue,
  sourceAddPdfSubmitDisabled,
  sourceAddUrlIssue,
} from '../src/domain/source-add'

describe('sourceAddMethodAfterTabKey', () => {
  it('moves across the three methods and wraps at the ends', () => {
    expect(sourceAddMethodAfterTabKey('url', 'ArrowRight')).toBe('pdf')
    expect(sourceAddMethodAfterTabKey('url', 'ArrowLeft')).toBe('paste')
  })

  it('jumps to the first or last method on Home and End', () => {
    expect(sourceAddMethodAfterTabKey('paste', 'Home')).toBe('url')
    expect(sourceAddMethodAfterTabKey('url', 'End')).toBe('paste')
  })

  it('ignores keys that are not part of the tablist pattern', () => {
    expect(sourceAddMethodAfterTabKey('pdf', 'ArrowDown')).toBe(null)
  })
})

describe('sourceAdd panel visibility', () => {
  it('conceals every method except the selected one', () => {
    expect(sourceAddPanelIsConcealed('url', 'url')).toBe(false)
    expect(sourceAddPanelIsConcealed('pdf', 'url')).toBe(true)
    expect(sourceAddPanelIsConcealed('paste', 'url')).toBe(true)
    expect(sourceAddPanelIsConcealed('paste', 'paste')).toBe(false)
  })
})

describe('sourceAddIsDirty and close intent', () => {
  it('treats the empty draft as clean, including whitespace-only fields', () => {
    expect(sourceAddIsDirty(emptySourceAddDraft())).toBe(false)
    expect(
      sourceAddIsDirty({
        url: '   ',
        hasPdf: false,
        pasteTitle: ' ',
        pasteBody: '\n',
        pasteUrl: '\t',
      }),
    ).toBe(false)
  })

  it('is dirty when any method has a real value', () => {
    expect(sourceAddIsDirty({ ...emptySourceAddDraft(), url: 'https://example.com' })).toBe(true)
    expect(sourceAddIsDirty({ ...emptySourceAddDraft(), hasPdf: true })).toBe(true)
    expect(sourceAddIsDirty({ ...emptySourceAddDraft(), pasteTitle: '題' })).toBe(true)
    expect(sourceAddIsDirty({ ...emptySourceAddDraft(), pasteBody: '本文' })).toBe(true)
    expect(sourceAddIsDirty({ ...emptySourceAddDraft(), pasteUrl: 'https://example.com' })).toBe(true)
  })

  it('blocks close while busy, confirms when dirty, and closes when clean', () => {
    expect(sourceAddCloseIntent({ busy: true, dirty: true })).toBe('block-busy')
    expect(sourceAddCloseIntent({ busy: true, dirty: false })).toBe('block-busy')
    expect(sourceAddCloseIntent({ busy: false, dirty: true })).toBe('confirm-discard')
    expect(sourceAddCloseIntent({ busy: false, dirty: false })).toBe('close')
  })
})

describe('sourceAdd field issues', () => {
  it('trims URL whitespace and names a fix when the value is empty or invalid', () => {
    expect(sourceAddUrlIssue('')).toBe(
      'URLを入力してください。https:// から始まるページのアドレスを入れてください。',
    )
    expect(sourceAddUrlIssue('   ')).toBe(
      'URLを入力してください。https:// から始まるページのアドレスを入れてください。',
    )
    expect(sourceAddUrlIssue('not a url')).toBe(
      '有効なURLではありません。https://example.com のように入力してください',
    )
    expect(sourceAddUrlIssue('ftp://example.com/file')).toBe('http または https のURLだけ登録できます')
    expect(sourceAddUrlIssue('  https://example.com/article  ')).toBe(null)
  })

  it('accepts an empty optional paste URL and validates a filled one', () => {
    expect(sourceAddPasteUrlIssue('')).toBe(null)
    expect(sourceAddPasteUrlIssue('  ')).toBe(null)
    expect(sourceAddPasteUrlIssue('nope')).toBe(
      '有効なURLではありません。https://example.com のように入力してください',
    )
  })

  it('rejects an empty paste title and a body over 200,000 characters', () => {
    expect(sourceAddPasteTitleIssue('')).toBe('タイトルを入力してください。')
    expect(sourceAddPasteTitleIssue('題')).toBe(null)
    expect(sourceAddPasteBodyIssue('')).toBe('本文を入力してください。')
    expect(sourceAddPasteBodyIssue('本文')).toBe(null)
    expect(sourceAddPasteBodyIssue('あ'.repeat(200_001))).toBe(
      '本文は200,000文字以内にしてください。超過分を削除してから送信してください。',
    )
    expect(sourceAddPasteBodyCount('あ'.repeat(200_001))).toEqual({
      current: 200_001,
      max: 200_000,
      over: true,
    })
    expect(sourceAddPasteBodyCount('短い')).toEqual({ current: 2, max: 200_000, over: false })
  })

  it('rejects a missing, non-PDF, empty, or oversized file', () => {
    expect(sourceAddPdfIssue(null)).toBe('PDFファイルを選んでください')
    expect(sourceAddPdfIssue({ name: 'notes.png', size: 12, type: 'image/png' })).toBe(
      'PDFファイルを選んでください',
    )
    expect(sourceAddPdfIssue({ name: 'notes.pdf', size: 0, type: 'application/pdf' })).toBe(
      'ファイルが空です',
    )
    expect(
      sourceAddPdfIssue({ name: 'notes.pdf', size: 8 * 1024 * 1024 + 1, type: 'application/pdf' }),
    ).toBe('PDFは8MB以下にしてください')
    expect(sourceAddPdfIssue({ name: 'notes.PDF', size: 2048, type: '' })).toBe(null)
  })

  it('blocks invalid files and busy uploads, but permits another attempt with a valid file', () => {
    const valid = { name: 'notes.pdf', size: 2048, type: 'application/pdf' }
    expect(sourceAddPdfSubmitDisabled(valid, false)).toBe(false)
    expect(sourceAddPdfSubmitDisabled(valid, true)).toBe(true)
    expect(sourceAddPdfSubmitDisabled(null, false)).toBe(false)
    expect(sourceAddPdfSubmitDisabled({ ...valid, size: 0 }, false)).toBe(true)
    expect(sourceAddPdfSubmitDisabled({ ...valid, size: 8 * 1024 * 1024 + 1 }, false)).toBe(true)
    expect(sourceAddPdfSubmitDisabled({ ...valid, name: 'notes.png', type: 'image/png' }, false)).toBe(true)
  })
})
