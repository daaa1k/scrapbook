import { useEffect, useId, useRef } from 'react'
import { Button } from '~/components/ui/button'
import { APP_SHORTCUTS, SHORTCUT_HELP_TITLE } from '~/domain/shortcuts'

export type ShortcutHelpDialogProps = {
  open: boolean
  onClose: () => void
}

export function ShortcutHelpDialog({ open, onClose }: ShortcutHelpDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const skipCloseEvent = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
      dialog.querySelector<HTMLButtonElement>('[data-shortcut-close]')?.focus()
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
      aria-labelledby={titleId}
      className="m-auto w-[min(100%,32rem)] max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-ink shadow-lg backdrop:bg-overlay"
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      onClose={() => {
        if (skipCloseEvent.current) {
          skipCloseEvent.current = false
          return
        }
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        onClose()
      }}
    >
      <div className="space-y-stack p-inset">
        <h2 id={titleId} className="text-title font-semibold">
          {SHORTCUT_HELP_TITLE}
        </h2>
        <table className="w-full border-collapse text-left text-body">
          <thead>
            <tr className="border-b border-border-subtle text-meta text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                操作
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                キー
              </th>
              <th scope="col" className="py-2 font-medium">
                場面
              </th>
            </tr>
          </thead>
          <tbody>
            {APP_SHORTCUTS.map((shortcut) => (
              <tr key={shortcut.id} className="border-b border-border-subtle align-top">
                <td className="py-2 pr-3">{shortcut.description}</td>
                <td className="py-2 pr-3 font-mono text-meta">{shortcut.keys}</td>
                <td className="py-2 text-meta text-muted">{shortcut.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end">
          <Button type="button" variant="secondary" data-shortcut-close onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    </dialog>
  )
}
