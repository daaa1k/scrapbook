import { useEffect, useId, useRef } from 'react'
import { Button } from '~/components/ui/button'

export type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: string
  bullets?: readonly string[]
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  bullets,
  confirmLabel = '削除',
  cancelLabel = 'キャンセル',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const skipCloseEvent = useRef(false)
  const titleId = useId()
  const bodyId = useId()
  const describedBy = description || (bullets && bullets.length > 0) ? bodyId : undefined

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
      dialog.querySelector<HTMLButtonElement>('[data-confirm-cancel]')?.focus()
    } else if (dialog.open) {
      skipCloseEvent.current = true
      dialog.close()
    }
    return () => {
      if (dialog.open) {
        skipCloseEvent.current = true
        dialog.close()
      }
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      className="m-auto w-[min(100%,28rem)] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-ink shadow-lg backdrop:bg-overlay"
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onCancel()
      }}
      onClose={() => {
        if (skipCloseEvent.current) {
          skipCloseEvent.current = false
          return
        }
        onCancel()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        onCancel()
      }}
    >
      <div className="space-y-4 p-5">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {describedBy ? (
          <div id={bodyId} className="space-y-3 text-sm">
            {description ? <p>{description}</p> : null}
            {bullets && bullets.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" data-confirm-cancel="" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
