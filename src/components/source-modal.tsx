import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { ConfirmDialog } from '~/components/ui/confirm-dialog'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import type { NotebookId, NotebookTarget } from '~/domain/organization'
import {
  MAX_PASTE_TITLE_CHARS,
  MAX_SOURCE_BODY_CHARS,
  SOURCE_ADD_BUSY_HINT,
  SOURCE_ADD_PDF_HINT,
  SOURCE_ADD_PDF_OK,
  SOURCE_ADD_TABLIST_LABEL,
  SOURCE_ADD_TABS,
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
  type SourceAddMethod,
} from '~/domain/source-add'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { cn, userFacingError } from '~/lib/utils'
import { pasteSource, registerPdf, registerSource } from '~/server/functions/sources'

export type SourceAddedResult = {
  sourceId: string
  notebookId: NotebookId
}

type SourceModalProps = {
  notebook: NotebookTarget
  open: boolean
  onClose: () => void
  onSourceAdded: (result: SourceAddedResult) => void
}

type FieldErrors = {
  url: string | null
  pdf: string | null
  pasteTitle: string | null
  pasteBody: string | null
  pasteUrl: string | null
}

function emptyFieldErrors(): FieldErrors {
  return {
    url: null,
    pdf: null,
    pasteTitle: null,
    pasteBody: null,
    pasteUrl: null,
  }
}

function describedBy(...ids: Array<string | false | null | undefined>): string | undefined {
  const next = ids.filter((id): id is string => Boolean(id))
  return next.length > 0 ? next.join(' ') : undefined
}

function panelConcealment(concealed: boolean) {
  return {
    hidden: concealed,
    'aria-hidden': concealed ? true : undefined,
    inert: concealed ? true : undefined,
  }
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-body font-medium">
      {children}
    </label>
  )
}

function PendingMark() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      aria-hidden="true"
    />
  )
}

function SourceAddTabs({
  selected,
  disabled,
  onSelect,
}: {
  selected: SourceAddMethod
  disabled: boolean
  onSelect: (method: SourceAddMethod) => void
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const next = sourceAddMethodAfterTabKey(selected, event.key)
    if (!next) return
    event.preventDefault()
    onSelect(next)
    document.getElementById(sourceAddTabId(next))?.focus()
  }

  return (
    <div
      className="grid grid-cols-3 overflow-hidden rounded-md border border-border"
      role="tablist"
      aria-label={SOURCE_ADD_TABLIST_LABEL}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
    >
      {SOURCE_ADD_TABS.map((tab) => {
        const isSelected = selected === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={sourceAddTabId(tab.id)}
            aria-controls={sourceAddPanelId(tab.id)}
            aria-selected={isSelected}
            aria-disabled={disabled || undefined}
            tabIndex={isSelected ? 0 : -1}
            disabled={disabled}
            className={cn(
              'relative flex min-h-11 items-center justify-center px-2 text-body',
              isSelected
                ? 'bg-inverse font-bold text-canvas'
                : 'font-medium text-muted hover:bg-surface-muted active:bg-surface-muted',
              disabled && 'disabled:cursor-not-allowed disabled:text-disabled disabled:opacity-60',
            )}
            onClick={() => {
              if (disabled) return
              onSelect(tab.id)
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

export function SourceModal({ notebook, open, onClose, onSourceAdded }: SourceModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const ignoreNextCloseEvent = useRef(false)
  const methodRef = useRef<SourceAddMethod>('url')
  const closeAfterDiscard = useRef(false)
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<SourceAddMethod>('url')
  const [url, setUrl] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>(emptyFieldErrors)
  const [discardOpen, setDiscardOpen] = useState(false)

  const creatingNotebook = notebook === 'new'
  const discard = sourceAddDiscardCopy()
  const pasteCount = sourceAddPasteBodyCount(pasteBody)
  methodRef.current = method

  function resetSession() {
    setMethod('url')
    setUrl('')
    setPasteTitle('')
    setPasteBody('')
    setPasteUrl('')
    setPdfFile(null)
    setPdfUploadError(null)
    setErrors(emptyFieldErrors())
    setDiscardOpen(false)
    if (pdfInputRef.current) pdfInputRef.current.value = ''
  }

  function closeWithoutDismiss(dialog: HTMLDialogElement) {
    ignoreNextCloseEvent.current = true
    dialog.close()
  }

  function dirtyDraft() {
    return sourceAddIsDirty({
      url,
      hasPdf: pdfFile !== null,
      pasteTitle,
      pasteBody,
      pasteUrl,
    })
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      closeWithoutDismiss(dialog)
    }
    return () => {
      if (dialog.open) closeWithoutDismiss(dialog)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const fieldId = sourceAddFirstFieldId(methodRef.current)
    const frame = requestAnimationFrame(() => {
      document.getElementById(fieldId)?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (discardOpen || !closeAfterDiscard.current) return
    const timer = window.setTimeout(() => {
      closeAfterDiscard.current = false
      dialogRef.current?.close()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [discardOpen])

  async function invalidateAfterIngest(result: SourceAddedResult) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
    ])
    return result
  }

  const register = useMutation({
    mutationFn: async (value: string) => {
      const result = await registerSource({ data: { url: value, notebook } })
      return invalidateAfterIngest({ sourceId: result.sourceId, notebookId: result.notebookId })
    },
    onSuccess: (result) => {
      resetSession()
      onSourceAdded(result)
    },
    onError: (error) => setErrors((current) => ({ ...current, url: userFacingError(error) })),
  })

  const paste = useMutation({
    mutationFn: async () => {
      const trimmedPasteUrl = pasteUrl.trim()
      const result = await pasteSource({
        data: {
          title: pasteTitle,
          body: pasteBody,
          url: trimmedPasteUrl ? trimmedPasteUrl : undefined,
          notebook,
        },
      })
      return invalidateAfterIngest({ sourceId: result.sourceId, notebookId: result.notebookId })
    },
    onSuccess: (result) => {
      resetSession()
      onSourceAdded(result)
    },
    onError: (error) => setErrors((current) => ({ ...current, pasteBody: userFacingError(error) })),
  })

  const uploadPdf = useMutation({
    mutationFn: async (file: File) => {
      const data = new FormData()
      data.set('file', file)
      data.set('notebook', notebook)
      const result = await registerPdf({ data })
      return invalidateAfterIngest({ sourceId: result.sourceId, notebookId: result.notebookId })
    },
    onSuccess: (result) => {
      resetSession()
      onSourceAdded(result)
    },
    onError: (error) => setPdfUploadError(userFacingError(error)),
  })

  const submitting: SourceAddMethod | null = register.isPending
    ? 'url'
    : uploadPdf.isPending
      ? 'pdf'
      : paste.isPending
        ? 'paste'
        : null
  const busy = submitting !== null

  function requestClose() {
    const intent = sourceAddCloseIntent({ busy, dirty: dirtyDraft() })
    if (intent === 'block-busy') return
    if (intent === 'confirm-discard') {
      setDiscardOpen(true)
      return
    }
    resetSession()
    dialogRef.current?.close()
  }

  function pickPdf(file: File | null) {
    if (!file && pdfInputRef.current) pdfInputRef.current.value = ''
    setPdfFile(file)
    setPdfUploadError(null)
    setErrors((current) => ({
      ...current,
      pdf: file ? sourceAddPdfIssue({ name: file.name, size: file.size, type: file.type }) : null,
    }))
  }

  const dialogDescribedBy = describedBy('source-modal-desc', busy && 'source-modal-busy')

  return (
    <>
      <dialog
        ref={dialogRef}
        className="m-auto w-[min(100%,32rem)] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-ink shadow-lg backdrop:bg-overlay"
        onCancel={(event) => {
          const intent = sourceAddCloseIntent({ busy, dirty: dirtyDraft() })
          if (intent === 'close') return
          event.preventDefault()
          if (intent === 'confirm-discard') setDiscardOpen(true)
        }}
        onClose={() => {
          if (ignoreNextCloseEvent.current) {
            ignoreNextCloseEvent.current = false
            return
          }
          if (busy) return
          resetSession()
          onClose()
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return
          requestClose()
        }}
        aria-labelledby="source-modal-title"
        aria-describedby={dialogDescribedBy}
        aria-busy={busy || undefined}
      >
        <div className="space-y-4 p-inset">
          <div className="flex items-start justify-between gap-gap">
            <div className="min-w-0 pr-2">
              <h2 id="source-modal-title" className="text-title font-semibold">
                {creatingNotebook ? '新しいノート' : 'ソースを追加'}
              </h2>
              <p id="source-modal-desc" className="mt-1 text-status text-muted">
                {creatingNotebook
                  ? '最初のソースを登録するとノートが作成されます。閉じても空のノートは残りません。'
                  : 'URL・PDF・貼り付けからソースを追加します。'}
              </p>
            </div>
            <Button
              type="button"
              variant="icon"
              className="h-11 w-11 shrink-0"
              disabled={busy}
              aria-label="閉じる"
              onClick={requestClose}
            >
              <span aria-hidden="true">×</span>
            </Button>
          </div>

          {busy ? (
            <p id="source-modal-busy" role="status">
              {SOURCE_ADD_BUSY_HINT}
            </p>
          ) : null}

          <SourceAddTabs selected={method} disabled={busy} onSelect={setMethod} />

          <div
            id={sourceAddPanelId('url')}
            role="tabpanel"
            aria-labelledby={sourceAddTabId('url')}
            {...panelConcealment(sourceAddPanelIsConcealed('url', method))}
          >
            <form
              className="space-y-stack"
              onSubmit={(event) => {
                event.preventDefault()
                const trimmed = url.trim()
                setUrl(trimmed)
                const issue = sourceAddUrlIssue(trimmed)
                if (issue) {
                  setErrors((current) => ({ ...current, url: issue }))
                  return
                }
                setErrors((current) => ({ ...current, url: null }))
                register.mutate(trimmed)
              }}
            >
              <div>
                <FieldLabel htmlFor="source-add-url">ページのURL</FieldLabel>
                <Input
                  id="source-add-url"
                  name="modal-url"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  required
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value)
                    if (errors.url) setErrors((current) => ({ ...current, url: null }))
                  }}
                  onBlur={() => setUrl((current) => current.trim())}
                  aria-invalid={errors.url ? true : undefined}
                  aria-describedby={describedBy(errors.url && 'source-add-url-error')}
                  disabled={busy}
                />
              </div>
              <Button
                type="submit"
                className="gap-2"
                disabled={busy}
                aria-busy={submitting === 'url' || undefined}
              >
                {submitting === 'url' ? <PendingMark /> : null}
                {sourceAddSubmitLabel('url', submitting === 'url')}
              </Button>
            </form>
            {errors.url ? (
              <Alert id="source-add-url-error" className="mt-2">
                {errors.url}
              </Alert>
            ) : null}
          </div>

          <div
            id={sourceAddPanelId('pdf')}
            role="tabpanel"
            aria-labelledby={sourceAddTabId('pdf')}
            {...panelConcealment(sourceAddPanelIsConcealed('pdf', method))}
          >
            <form
              className="space-y-stack"
              onSubmit={(event) => {
                event.preventDefault()
                const issue = sourceAddPdfIssue(
                  pdfFile
                    ? { name: pdfFile.name, size: pdfFile.size, type: pdfFile.type }
                    : null,
                )
                if (issue || !pdfFile) {
                  setErrors((current) => ({ ...current, pdf: issue }))
                  return
                }
                setErrors((current) => ({ ...current, pdf: null }))
                setPdfUploadError(null)
                uploadPdf.mutate(pdfFile)
              }}
            >
              <div>
                <FieldLabel htmlFor="source-add-pdf">PDFファイル</FieldLabel>
                <p id="source-add-pdf-hint" className="mb-2 text-status text-muted">
                  {SOURCE_ADD_PDF_HINT}
                </p>
                <Input
                  ref={pdfInputRef}
                  id="source-add-pdf"
                  name="modal-pdf"
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => pickPdf(event.target.files?.[0] ?? null)}
                  aria-invalid={errors.pdf ? true : undefined}
                  aria-describedby={describedBy(
                    'source-add-pdf-hint',
                    pdfFile && 'source-add-pdf-pick',
                    (errors.pdf || pdfUploadError) && 'source-add-pdf-error',
                  )}
                  disabled={busy}
                />
              </div>
              {pdfFile ? (
                <div id="source-add-pdf-pick" className="space-y-stack text-body">
                  <p>
                    {pdfFile.name}（{formatFileBytes(pdfFile.size)}）
                  </p>
                  {errors.pdf ? null : <p>{SOURCE_ADD_PDF_OK}</p>}
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => pickPdf(null)}
                  >
                    選択を解除
                  </Button>
                </div>
              ) : null}
              <Button
                type="submit"
                className="gap-2"
                disabled={sourceAddPdfSubmitDisabled(
                  pdfFile ? { name: pdfFile.name, size: pdfFile.size, type: pdfFile.type } : null,
                  busy,
                )}
                aria-busy={submitting === 'pdf' || undefined}
              >
                {submitting === 'pdf' ? <PendingMark /> : null}
                {sourceAddSubmitLabel('pdf', submitting === 'pdf')}
              </Button>
            </form>
            {errors.pdf || pdfUploadError ? (
              <Alert id="source-add-pdf-error" className="mt-2">
                {errors.pdf || pdfUploadError}
              </Alert>
            ) : null}
          </div>

          <div
            id={sourceAddPanelId('paste')}
            role="tabpanel"
            aria-labelledby={sourceAddTabId('paste')}
            {...panelConcealment(sourceAddPanelIsConcealed('paste', method))}
          >
            <form
              className="space-y-stack"
              onSubmit={(event) => {
                event.preventDefault()
                const titleIssue = sourceAddPasteTitleIssue(pasteTitle)
                const bodyIssue = sourceAddPasteBodyIssue(pasteBody)
                const urlIssue = sourceAddPasteUrlIssue(pasteUrl)
                if (titleIssue || bodyIssue || urlIssue || pasteCount.over) {
                  setErrors((current) => ({
                    ...current,
                    pasteTitle: titleIssue,
                    pasteBody: bodyIssue ?? (pasteCount.over ? sourceAddPasteBodyIssue(pasteBody) : null),
                    pasteUrl: urlIssue,
                  }))
                  return
                }
                setErrors((current) => ({
                  ...current,
                  pasteTitle: null,
                  pasteBody: null,
                  pasteUrl: null,
                }))
                paste.mutate()
              }}
            >
              <div>
                <FieldLabel htmlFor="source-add-paste-title">タイトル</FieldLabel>
                <Input
                  id="source-add-paste-title"
                  name="modal-paste-title"
                  required
                  maxLength={MAX_PASTE_TITLE_CHARS}
                  placeholder="記事のタイトル"
                  value={pasteTitle}
                  onChange={(event) => {
                    setPasteTitle(event.target.value)
                    if (errors.pasteTitle) setErrors((current) => ({ ...current, pasteTitle: null }))
                  }}
                  aria-invalid={errors.pasteTitle ? true : undefined}
                  aria-describedby={describedBy(errors.pasteTitle && 'source-add-paste-title-error')}
                  disabled={busy}
                />
                {errors.pasteTitle ? (
                  <Alert id="source-add-paste-title-error" className="mt-2">
                    {errors.pasteTitle}
                  </Alert>
                ) : null}
              </div>
              <div>
                <FieldLabel htmlFor="source-add-paste-url">URL（任意）</FieldLabel>
                <Input
                  id="source-add-paste-url"
                  name="modal-paste-url"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  placeholder="https://example.com/article"
                  value={pasteUrl}
                  onChange={(event) => {
                    setPasteUrl(event.target.value)
                    if (errors.pasteUrl) setErrors((current) => ({ ...current, pasteUrl: null }))
                  }}
                  onBlur={() => setPasteUrl((current) => current.trim())}
                  aria-invalid={errors.pasteUrl ? true : undefined}
                  aria-describedby={describedBy(errors.pasteUrl && 'source-add-paste-url-error')}
                  disabled={busy}
                />
                {errors.pasteUrl ? (
                  <Alert id="source-add-paste-url-error" className="mt-2">
                    {errors.pasteUrl}
                  </Alert>
                ) : null}
              </div>
              <div>
                <FieldLabel htmlFor="source-add-paste-body">本文</FieldLabel>
                <Textarea
                  id="source-add-paste-body"
                  name="modal-paste-body"
                  required
                  maxLength={MAX_SOURCE_BODY_CHARS}
                  placeholder="本文"
                  value={pasteBody}
                  onChange={(event) => {
                    const next = event.target.value
                    setPasteBody(next)
                    setErrors((current) => ({
                      ...current,
                      pasteBody: sourceAddPasteBodyCount(next).over
                        ? sourceAddPasteBodyIssue(next)
                        : current.pasteBody && next.trim()
                          ? null
                          : current.pasteBody,
                    }))
                  }}
                  aria-invalid={errors.pasteBody ? true : undefined}
                  aria-describedby={describedBy(
                    'source-add-paste-count',
                    errors.pasteBody && 'source-add-paste-body-error',
                  )}
                  disabled={busy}
                />
                <p
                  id="source-add-paste-count"
                  className={cn('mt-1 text-meta', pasteCount.over ? 'text-danger' : 'text-muted')}
                >
                  {pasteCount.current.toLocaleString('ja-JP')} / {pasteCount.max.toLocaleString('ja-JP')}
                </p>
                {errors.pasteBody ? (
                  <Alert id="source-add-paste-body-error" className="mt-2">
                    {errors.pasteBody}
                  </Alert>
                ) : null}
              </div>
              <Button
                type="submit"
                className="gap-2"
                disabled={busy || pasteCount.over}
                aria-busy={submitting === 'paste' || undefined}
              >
                {submitting === 'paste' ? <PendingMark /> : null}
                {sourceAddSubmitLabel('paste', submitting === 'paste')}
              </Button>
            </form>
          </div>
        </div>
      </dialog>
      <ConfirmDialog
        open={discardOpen}
        title={discard.title}
        description={discard.description}
        confirmLabel={discard.confirmLabel}
        cancelLabel={discard.cancelLabel}
        tone="default"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={() => {
          closeAfterDiscard.current = true
          resetSession()
        }}
      />
    </>
  )
}
