import type { TextareaHTMLAttributes } from 'react'
import { cn } from '~/lib/utils'

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-32 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:text-disabled disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}
