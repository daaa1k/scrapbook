import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-md border border-dashed border-border p-4">
      <p className="font-medium text-ink">{title}</p>
      {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
