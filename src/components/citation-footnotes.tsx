import { useId, useState } from 'react'
import type { CitationView } from '~/domain/citations'

type CitedProseProps = {
  text: string
  citations: readonly CitationView[]
  emptyLabel: string
}

export function CitedProse({ text, citations, emptyLabel }: CitedProseProps) {
  if (!text) {
    return <p className="whitespace-pre-wrap">{emptyLabel}</p>
  }

  return (
    <p className="whitespace-pre-wrap">
      {text}
      {citations.length > 0 ? (
        <span className="ml-1 inline-flex flex-wrap items-baseline gap-0.5 align-baseline">
          {citations.map((citation, index) => (
            <CitationFootnote key={citation.id} index={index + 1} excerpt={citation.excerpt} />
          ))}
        </span>
      ) : null}
    </p>
  )
}

type CitationFootnoteProps = {
  index: number
  excerpt: string
}

function CitationFootnote({ index, excerpt }: CitationFootnoteProps) {
  const [open, setOpen] = useState(false)
  const tipId = useId()
  const label = `引用${index}`

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="align-super text-xs font-medium text-zinc-600 underline decoration-dotted underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        aria-label={label}
        aria-expanded={open}
        aria-controls={tipId}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        [{index}]
      </button>
      {open ? (
        <span
          id={tipId}
          role="region"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-md border border-zinc-200 bg-white p-3 text-left text-sm font-normal normal-case text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <span className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
          <span className="block whitespace-pre-wrap">{excerpt}</span>
        </span>
      ) : null}
    </span>
  )
}
