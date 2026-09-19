export function PendingMark() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
      aria-hidden="true"
    />
  )
}

export function LoadingSkeleton({
  label = '読み込み中…',
  lines = 3,
}: {
  label?: string
  lines?: number
}) {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">{label}</p>
      <div className="space-y-3">
        {Array.from({ length: lines }, (_, index) => (
          <div
            key={index}
            className="h-16 animate-pulse rounded-lg bg-surface-muted motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  )
}
