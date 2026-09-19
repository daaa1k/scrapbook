import { useId, useState } from 'react'
import type { CitationView } from '~/domain/citations'

type CitedProseProps = {
  text: string
  citations: readonly CitationView[]
  emptyLabel: string
}

export function CitedProse({ text, citations, emptyLabel }: CitedProseProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const panelId = useId()

  if (!text) {
    return <p className="whitespace-pre-wrap">{emptyLabel}</p>
  }

  const openIndex = citations.findIndex((citation) => citation.id === openId)
  const openCitation = openIndex >= 0 ? citations[openIndex] : null
  const openLabel = openCitation ? `引用${openIndex + 1}` : null

  return (
    <div>
      <p className="break-anywhere whitespace-pre-wrap">
        {text}
        {citations.length > 0 ? (
          <span className="ml-1 inline-flex flex-wrap items-baseline gap-0.5 align-baseline">
            {citations.map((citation, index) => {
              const label = `引用${index + 1}`
              const expanded = openId === citation.id
              return (
                <button
                  key={citation.id}
                  type="button"
                  className="tap-target inline-flex min-h-11 min-w-11 items-center justify-center align-super text-xs font-medium text-zinc-600 underline decoration-dotted underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  aria-label={label}
                  aria-expanded={expanded}
                  aria-controls={expanded ? panelId : undefined}
                  onClick={() => setOpenId((current) => (current === citation.id ? null : citation.id))}
                >
                  [{index + 1}]
                </button>
              )
            })}
          </span>
        ) : null}
      </p>
      {openCitation && openLabel ? (
        <aside
          id={panelId}
          role="region"
          aria-label={openLabel}
          className="mt-2 rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">{openLabel}</p>
          <p className="break-anywhere whitespace-pre-wrap">{openCitation.excerpt}</p>
        </aside>
      ) : null}
    </div>
  )
}
