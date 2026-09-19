import type { HTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

export function Alert({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p role="alert" className={cn('text-status text-danger', className)} {...props} />
}
