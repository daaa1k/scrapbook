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
    <div className="rounded-md border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-2 text-sm text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}
