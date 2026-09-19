import { useId, useState } from 'react'
import { Button } from '~/components/ui/button'
import type { CitationView } from '~/domain/citations'
import {
  COPY_FAILURE_ANNOUNCEMENT,
  COPY_SUCCESS_ANNOUNCEMENT,
} from '~/domain/source-list-controls'
import { copyText } from '~/lib/clipboard'

const LONG_EXCERPT_CHARS = 280

type CitedProseProps = {
  text: string
  citations: readonly CitationView[]
  emptyLabel: string
  onCopyAnnouncement?: (message: string) => void
}

export function CitedProse({ text, citations, emptyLabel, onCopyAnnouncement }: CitedProseProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()

  if (!text) {
    return <p className="whitespace-pre-wrap">{emptyLabel}</p>
  }

  const openIndex = citations.findIndex((citation) => citation.id === openId)
  const openCitation = openIndex >= 0 ? citations[openIndex] : null
  const openLabel = openCitation ? `引用${openIndex + 1}` : null
  const excerpt = openCitation?.excerpt ?? ''
  const excerptIsLong = excerpt.length > LONG_EXCERPT_CHARS
  const shownExcerpt =
    excerptIsLong && !expanded ? `${excerpt.slice(0, LONG_EXCERPT_CHARS).trimEnd()}…` : excerpt

  async function copyExcerpt() {
    const result = await copyText(excerpt)
    onCopyAnnouncement?.(result === 'ok' ? COPY_SUCCESS_ANNOUNCEMENT : COPY_FAILURE_ANNOUNCEMENT)
  }

  return (
    <div>
      <p className="break-anywhere whitespace-pre-wrap">
        {text}
        {citations.length > 0 ? (
          <span className="ml-1 inline-flex flex-wrap items-baseline gap-0.5 align-baseline">
            {citations.map((citation, index) => {
              const label = `引用${index + 1}`
              const isOpen = openId === citation.id
              return (
                <button
                  key={citation.id}
                  type="button"
                  className="tap-target inline-flex min-h-11 min-w-11 items-center justify-center align-super text-xs font-medium text-zinc-600 underline decoration-dotted underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  aria-label={label}
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? panelId : undefined}
                  onClick={() => {
                    setOpenId((current) => (current === citation.id ? null : citation.id))
                    setExpanded(false)
                  }}
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
          className="mt-2 space-y-2 rounded-md border border-zinc-200 bg-white p-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{openLabel}</p>
            <div className="flex flex-wrap gap-2">
              {excerptIsLong ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded((value) => !value)}>
                  {expanded ? '折りたたむ' : '全文表示'}
                </Button>
              ) : null}
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyExcerpt()}>
                コピー
              </Button>
            </div>
          </div>
          <p className="break-anywhere whitespace-pre-wrap">{shownExcerpt}</p>
        </aside>
      ) : null}
    </div>
  )
}
