import { describe, expect, it } from 'vitest'
import {
  emptySourceAddDraft,
  formatFileBytes,
  sourceAddCloseIntent,
  sourceAddDiscardCopy,
  sourceAddFirstFieldId,
  sourceAddIsDirty,
  sourceAddMethodAfterTabKey,
  sourceAddPanelId,
  sourceAddPanelIsConcealed,
  sourceAddPasteBodyCount,
  sourceAddPasteBodyIssue,
  sourceAddPasteTitleIssue,
  sourceAddPasteUrlIssue,
  sourceAddPdfIssue,
  sourceAddPdfSubmitDisabled,
  sourceAddSubmitLabel,
  sourceAddTabId,
  sourceAddUrlIssue,
} from '../src/domain/source-add'

describe('sourceAddMethodAfterTabKey', () => {
  it('moves across the three methods and wraps at the ends', () => {
    expect(sourceAddMethodAfterTabKey('url', 'ArrowRight')).toBe('pdf')
    expect(sourceAddMethodAfterTabKey('pdf', 'ArrowRight')).toBe('paste')
    expect(sourceAddMethodAfterTabKey('paste', 'ArrowRight')).toBe('url')
    expect(sourceAddMethodAfterTabKey('url', 'ArrowLeft')).toBe('paste')
    expect(sourceAddMethodAfterTabKey('pdf', 'ArrowLeft')).toBe('url')
    expect(sourceAddMethodAfterTabKey('paste', 'ArrowLeft')).toBe('pdf')
  })

  it('jumps to the first or last method on Home and End', () => {
    expect(sourceAddMethodAfterTabKey('paste', 'Home')).toBe('url')
    expect(sourceAddMethodAfterTabKey('url', 'End')).toBe('paste')
    expect(sourceAddMethodAfterTabKey('pdf', 'Home')).toBe('url')
    expect(sourceAddMethodAfterTabKey('pdf', 'End')).toBe('paste')
  })

  it('ignores keys that are not part of the tablist pattern', () => {
    expect(sourceAddMethodAfterTabKey('pdf', 'ArrowDown')).toBe(null)
    expect(sourceAddMethodAfterTabKey('pdf', 'Tab')).toBe(null)
    expect(sourceAddMethodAfterTabKey('pdf', 'Enter')).toBe(null)
  })
})

describe('sourceAdd panel ids and concealment', () => {
  it('names the tab, panel, and first field for each method', () => {
    expect(sourceAddTabId('url')).toBe('source-add-tab-url')
    expect(sourceAddPanelId('pdf')).toBe('source-add-panel-pdf')
    expect(sourceAddFirstFieldId('paste')).toBe('source-add-paste-title')
    expect(sourceAddFirstFieldId('url')).toBe('source-add-url')
    expect(sourceAddFirstFieldId('pdf')).toBe('source-add-pdf')
  })

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
      '本文は200,000文字以内にしてください。',
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

describe('sourceAdd copy', () => {
  it('names the in-progress submit and the idle action per method', () => {
    expect(sourceAddSubmitLabel('url', true)).toBe('登録中…')
    expect(sourceAddSubmitLabel('pdf', true)).toBe('登録中…')
    expect(sourceAddSubmitLabel('paste', false)).toBe('本文を保存')
    expect(sourceAddSubmitLabel('url', false)).toBe('URLを登録')
    expect(sourceAddSubmitLabel('pdf', false)).toBe('PDFを登録')
  })

  it('asks to discard typed input without calling it a delete', () => {
    expect(sourceAddDiscardCopy()).toEqual({
      title: '入力を破棄しますか？',
      description: '入力した内容は保存されません。',
      confirmLabel: '破棄する',
      cancelLabel: 'キャンセル',
    })
  })

  it('formats file sizes with one decimal for KB and MB', () => {
    expect(formatFileBytes(0)).toBe('0 B')
    expect(formatFileBytes(512)).toBe('512 B')
    expect(formatFileBytes(1536)).toBe('1.5 KB')
    expect(formatFileBytes(8 * 1024 * 1024)).toBe('8.0 MB')
  })
})
