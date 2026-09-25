import { JOB_ERROR_LABEL } from '~/domain/jobs'
import { MAX_PDF_BYTES, MAX_SOURCE_BODY_CHARS } from '~/domain/pdf'
import { MAX_PASTE_TITLE_CHARS, parseAndNormalizeUrl } from '~/domain/url'

export const SOURCE_ADD_METHODS = ['url', 'pdf', 'paste'] as const
export type SourceAddMethod = (typeof SOURCE_ADD_METHODS)[number]

export const SOURCE_ADD_TABS = [
  { id: 'url', label: 'URL' },
  { id: 'pdf', label: 'PDF' },
  { id: 'paste', label: '貼り付け' },
] as const satisfies ReadonlyArray<{ id: SourceAddMethod; label: string }>

export const SOURCE_ADD_TABLIST_LABEL = '入力方法'
export const SOURCE_ADD_BUSY_HINT = '登録中はキャンセルできません。'
export const SOURCE_ADD_PDF_HINT =
  'PDFのみ。最大8MB。スキャン画像のPDFは本文を抽出できないことがあります。'
export const SOURCE_ADD_PDF_OK = 'PDFとして登録できます。'

export type SourceAddDraft = {
  url: string
  hasPdf: boolean
  pasteTitle: string
  pasteBody: string
  pasteUrl: string
}

export type SourceAddPdfPick = {
  name: string
  size: number
  type: string
}

export type SourceAddCloseIntent = 'block-busy' | 'confirm-discard' | 'close'

export type SourceAddDiscardCopy = {
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
}

export function emptySourceAddDraft(): SourceAddDraft {
  return {
    url: '',
    hasPdf: false,
    pasteTitle: '',
    pasteBody: '',
    pasteUrl: '',
  }
}

export function sourceAddTabId(method: SourceAddMethod): `source-add-tab-${SourceAddMethod}` {
  return `source-add-tab-${method}`
}

export function sourceAddPanelId(method: SourceAddMethod): `source-add-panel-${SourceAddMethod}` {
  return `source-add-panel-${method}`
}

export function sourceAddFirstFieldId(method: SourceAddMethod): string {
  switch (method) {
    case 'url':
      return 'source-add-url'
    case 'pdf':
      return 'source-add-pdf'
    case 'paste':
      return 'source-add-paste-title'
    default: {
      const _never: never = method
      return _never
    }
  }
}

export function sourceAddMethodAfterTabKey(
  current: SourceAddMethod,
  key: string,
): SourceAddMethod | null {
  const index = SOURCE_ADD_METHODS.indexOf(current)
  if (index === -1) return null
  const last = SOURCE_ADD_METHODS.length - 1
  if (key === 'ArrowLeft') return SOURCE_ADD_METHODS[index === 0 ? last : index - 1]!
  if (key === 'ArrowRight') return SOURCE_ADD_METHODS[index === last ? 0 : index + 1]!
  if (key === 'Home') return SOURCE_ADD_METHODS[0]
  if (key === 'End') return SOURCE_ADD_METHODS[last]!
  return null
}

export function sourceAddPanelIsConcealed(
  method: SourceAddMethod,
  selected: SourceAddMethod,
): boolean {
  return method !== selected
}

export function sourceAddIsDirty(draft: SourceAddDraft): boolean {
  return (
    draft.url.trim() !== '' ||
    draft.hasPdf ||
    draft.pasteTitle.trim() !== '' ||
    draft.pasteBody.trim() !== '' ||
    draft.pasteUrl.trim() !== ''
  )
}

export function sourceAddCloseIntent(input: { busy: boolean; dirty: boolean }): SourceAddCloseIntent {
  if (input.busy) return 'block-busy'
  if (input.dirty) return 'confirm-discard'
  return 'close'
}

export function sourceAddDiscardCopy(): SourceAddDiscardCopy {
  return {
    title: '入力を破棄しますか？',
    description: '入力した内容は保存されません。',
    confirmLabel: '破棄する',
    cancelLabel: 'キャンセル',
  }
}

export function sourceAddSubmitLabel(method: SourceAddMethod, pending: boolean): string {
  if (pending) return '登録中…'
  switch (method) {
    case 'url':
      return 'URLを登録'
    case 'pdf':
      return 'PDFを登録'
    case 'paste':
      return '本文を保存'
    default: {
      const _never: never = method
      return _never
    }
  }
}

export function sourceAddUrlIssue(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return 'URLを入力してください。https:// から始まるページのアドレスを入れてください。'
  }
  try {
    parseAndNormalizeUrl(trimmed)
    return null
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_url'
    return JOB_ERROR_LABEL[code] ?? JOB_ERROR_LABEL.invalid_url
  }
}

export function sourceAddPasteTitleIssue(title: string): string | null {
  const trimmed = title.trim()
  if (!trimmed) return 'タイトルを入力してください。'
  if (title.length > MAX_PASTE_TITLE_CHARS) {
    return `タイトルは${MAX_PASTE_TITLE_CHARS.toLocaleString('ja-JP')}文字以内にしてください。`
  }
  return null
}

export function sourceAddPasteBodyIssue(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) return '本文を入力してください。'
  if (body.length > MAX_SOURCE_BODY_CHARS) {
    return `本文は${MAX_SOURCE_BODY_CHARS.toLocaleString('ja-JP')}文字以内にしてください。超過分を削除してから送信してください。`
  }
  return null
}

export function sourceAddPasteUrlIssue(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  return sourceAddUrlIssue(trimmed)
}

export function sourceAddPdfLooksLikePdf(pick: SourceAddPdfPick): boolean {
  if (pick.name.toLowerCase().endsWith('.pdf')) return true
  return pick.type === 'application/pdf'
}

export function sourceAddPdfIssue(pick: SourceAddPdfPick | null): string | null {
  if (!pick) return JOB_ERROR_LABEL.pdf_not_pdf
  if (!sourceAddPdfLooksLikePdf(pick)) return JOB_ERROR_LABEL.pdf_not_pdf
  if (pick.size === 0) return JOB_ERROR_LABEL.pdf_empty_file
  if (pick.size > MAX_PDF_BYTES) return JOB_ERROR_LABEL.pdf_too_large
  return null
}

export function sourceAddPdfSubmitDisabled(pick: SourceAddPdfPick | null, busy: boolean): boolean {
  return busy || (pick !== null && sourceAddPdfIssue(pick) !== null)
}

export function formatFileBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function sourceAddPasteBodyCount(body: string): {
  current: number
  max: number
  over: boolean
} {
  return {
    current: body.length,
    max: MAX_SOURCE_BODY_CHARS,
    over: body.length > MAX_SOURCE_BODY_CHARS,
  }
}

export { MAX_PASTE_TITLE_CHARS, MAX_SOURCE_BODY_CHARS }
