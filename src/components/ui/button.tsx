import type { ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '~/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon'
export type ButtonSize = 'sm' | 'md' | 'lg'

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-inverse text-canvas hover:opacity-90',
  secondary:
    'border border-border bg-surface text-ink hover:bg-surface-muted',
  ghost: 'bg-transparent text-ink hover:bg-surface-muted',
  danger: 'bg-danger text-danger-fg hover:opacity-90',
  icon: 'h-11 w-11 p-0 bg-transparent text-ink hover:bg-surface-muted',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-2.5 py-1.5 text-xs',
  md: 'min-h-11 px-3 py-2 text-sm',
  lg: 'min-h-11 px-4 py-2.5 text-base',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  className,
  type = 'button',
  variant = 'primary',
  size = 'md',
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium disabled:cursor-not-allowed disabled:text-disabled disabled:opacity-60',
        sizeClass[size],
        variantClass[variant],
        className,
      )}
      {...props}
    />
  )
}
