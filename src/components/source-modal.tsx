import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Input, controlClassName } from '~/components/ui/input'
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
  const queryClient = useQueryClient()
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [pasteTitle, setPasteTitle] = useState('')
  const [pasteBody, setPasteBody] = useState('')
  const [pasteUrl, setPasteUrl] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  async function afterIngest(sourceId: string) {
    await runOrganizationCommand({
      data: { type: 'move-source', sourceId, notebookId },
    })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sourceKeys.all }),
      queryClient.invalidateQueries({ queryKey: organizationKeys.catalog }),
    ])
    onSourceAdded(sourceId)
  }

  const register = useMutation({
    mutationFn: (value: string) => registerSource({ data: { url: value } }),
    onSuccess: async (result) => {
      setUrlError(null)
      await afterIngest(result.sourceId)
    },
    onError: (error) => setUrlError(userFacingError(error)),
  })

  const paste = useMutation({
    mutationFn: () =>
      pasteSource({
        data: {
          title: pasteTitle,
          body: pasteBody,
          url: pasteUrl.trim() ? pasteUrl : undefined,
        },
      }),
    onSuccess: async (result) => {
      setPasteError(null)
      await afterIngest(result.sourceId)
    },
    onError: (error) => setPasteError(userFacingError(error)),
  })

  const uploadPdf = useMutation({
    mutationFn: (file: File) => {
      const data = new FormData()
      data.set('file', file)
      return registerPdf({ data })
    },
    onSuccess: async (result) => {
      setPdfError(null)
      await afterIngest(result.sourceId)
    },
    onError: (error) => setPdfError(userFacingError(error)),
  })

  const busy = register.isPending || paste.isPending || uploadPdf.isPending

  return (
    <dialog
      ref={dialogRef}
      className="w-[min(100%,32rem)] max-h-[90vh] overflow-y-auto rounded-lg border border-zinc-200 bg-white p-0 text-zinc-900 shadow-lg backdrop:bg-zinc-950/40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      onClose={onClose}
      aria-labelledby="source-modal-title"
    >
      <div className="space-y-6 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="source-modal-title" className="text-lg font-semibold">
              ソースを追加
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              URL・PDF・貼り付けから最初のソースを追加します。スキップしてもノートブックは残ります。
            </p>
          </div>
          <Button type="button" disabled={busy} onClick={onClose}>
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
            <Button type="submit" disabled={busy}>
              URLを登録
            </Button>
          </form>
          {urlError ? <p className="mt-2 text-sm text-red-600">{urlError}</p> : null}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-medium">PDF</h3>
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
              className={controlClassName}
              onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
              aria-label="PDFファイル"
              disabled={busy}
            />
            <Button type="submit" disabled={busy}>
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
              maxLength={200}
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
              rows={6}
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
