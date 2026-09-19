import type { InputHTMLAttributes, Ref } from 'react'
import { cn } from '~/lib/utils'

export const controlClassName =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-body text-ink disabled:cursor-not-allowed disabled:text-disabled disabled:opacity-60'

export function Input({
  className,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={cn(controlClassName, className)} {...props} />
}
