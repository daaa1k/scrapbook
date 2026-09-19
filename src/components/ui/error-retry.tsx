import type { ReactNode } from 'react'
import { Alert } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'

export function ErrorRetry({
  id,
  children,
  onRetry,
}: {
  id?: string
  children: ReactNode
  onRetry: () => void
}) {
  return (
    <div className="space-y-3">
      <Alert id={id}>{children}</Alert>
      <Button type="button" variant="secondary" onClick={onRetry}>
        再試行
      </Button>
    </div>
  )
}
