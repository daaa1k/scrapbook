import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import type { NotebookId } from '~/domain/organization'
import { organizationKeys, sourceKeys } from '~/lib/query-keys'
import { userFacingError } from '~/lib/utils'
import { runOrganizationCommand } from '~/server/functions/organization'
import { pasteSource, registerPdf, registerSource } from '~/server/functions/sources'

type SourceModalProps = {
  notebookId: NotebookId
  open: boolean
  onClose: () => void
  onSourceAdded: (sourceId: string) => void
}

export function SourceModal({ notebookId, open, onClose, onSourceAdded }: SourceModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const ignoreNextCloseEvent = useRef(false)
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  function closeWithoutDismiss(dialog: HTMLDialogElement) {
    ignoreNextCloseEvent.current = true
    dialog.close()
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

  async function ingestIntoNotebook(sourceId: string) {
    await runOrganizationCommand({
      data: { type: 'move-source', sourceId, notebookId },
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
    ])
    return sourceId
  }

  const register = useMutation({
    mutationFn: async (value: string) => {
      const result = await registerSource({ data: { url: value } })
      return ingestIntoNotebook(result.sourceId)
    },
    onSuccess: (sourceId) => {
      setUrlError(null)
      onSourceAdded(sourceId)
    },
    onError: (error) => setUrlError(userFacingError(error)),
  })

  const paste = useMutation({
    mutationFn: async () => {
      const result = await pasteSource({
        data: {
          title: pasteTitle,
          body: pasteBody,
          url: pasteUrl.trim() ? pasteUrl : undefined,
        },
      })
      return ingestIntoNotebook(result.sourceId)
    },
    onSuccess: (sourceId) => {
      setPasteError(null)
      onSourceAdded(sourceId)
    },
    onError: (error) => setPasteError(userFacingError(error)),
  })

  const uploadPdf = useMutation({
    mutationFn: async (file: File) => {
      const data = new FormData()
      data.set('file', file)
      const result = await registerPdf({ data })
      return ingestIntoNotebook(result.sourceId)
    },
    onSuccess: (sourceId) => {
      setPdfError(null)
      onSourceAdded(sourceId)
    },
    onError: (error) => setPdfError(userFacingError(error)),
  })

  const busy = register.isPending || paste.isPending || uploadPdf.isPending

  function closeDialog() {
    dialogRef.current?.close()
  }

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-[min(100%,32rem)] max-h-[90vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-lg backdrop:bg-zinc-950/40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      onCancel={(event) => {
        if (busy) event.preventDefault()
      }}
      onClose={() => {
        if (ignoreNextCloseEvent.current) {
          ignoreNextCloseEvent.current = false
          return
        }
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return
        closeDialog()
      }}
      aria-labelledby="source-modal-title"
    >
      <div className="space-y-6 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="source-modal-title" className="text-lg font-semibold">
              ソースを追加
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              URL・PDF・貼り付けからソースを追加します。閉じてもノートブックは残ります。
            </p>
          </div>
          <Button type="button" className="shrink-0 whitespace-nowrap" disabled={busy} onClick={closeDialog}>
            閉じる
          </Button>
        </div>

        <section>
          <h3 className="mb-2 text-sm font-medium">URL</h3>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault()
              setUrlError(null)
              register.mutate(url)
            }}
          >
            <Input
              name="modal-url"
              type="url"
              required
              placeholder="https://example.com/article"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              aria-label="URL"
              disabled={busy}
            />
            <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={busy}>
              URLを登録
            </Button>
          </form>
          {urlError ? <p className="mt-2 text-sm text-red-600">{urlError}</p> : null}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">PDF</h3>
          <p className="mb-3 text-sm text-zinc-500">原本は非公開のまま保存します。8MBまでです。</p>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              setPdfError(null)
              if (!pdfFile) {
                setPdfError('PDFファイルを選んでください')
                return
              }
              uploadPdf.mutate(pdfFile)
            }}
          >
            <Input
              name="modal-pdf"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
              aria-label="PDFファイル"
              disabled={busy}
            />
            <Button type="submit" className="shrink-0 whitespace-nowrap" disabled={busy}>
              PDFを登録
            </Button>
          </form>
          {pdfError ? <p className="mt-2 text-sm text-red-600">{pdfError}</p> : null}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">本文を貼り付け</h3>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              setPasteError(null)
              paste.mutate()
            }}
          >
            <Input
              name="modal-paste-title"
              required
              placeholder="タイトル"
              value={pasteTitle}
              onChange={(event) => setPasteTitle(event.target.value)}
              aria-label="タイトル"
              disabled={busy}
            />
            <Input
              name="modal-paste-url"
              type="url"
              placeholder="URL（任意）"
              value={pasteUrl}
              onChange={(event) => setPasteUrl(event.target.value)}
              aria-label="URL（任意）"
              disabled={busy}
            />
            <Textarea
              name="modal-paste-body"
              required
              placeholder="本文"
              value={pasteBody}
              onChange={(event) => setPasteBody(event.target.value)}
              aria-label="本文"
              disabled={busy}
            />
            <Button type="submit" disabled={busy}>
              本文を保存
            </Button>
          </form>
          {pasteError ? <p className="mt-2 text-sm text-red-600">{pasteError}</p> : null}
        </section>
      </div>
    </dialog>
  )
}
