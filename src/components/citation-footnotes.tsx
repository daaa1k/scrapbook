import { useId, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { citationBodyContext, type CitationView } from '~/domain/citations'
import {
  COPY_FAILURE_ANNOUNCEMENT,
  COPY_SUCCESS_ANNOUNCEMENT,
} from '~/domain/source-list-controls'
import { copyText } from '~/lib/clipboard'

const LONG_EXCERPT_CHARS = 280

type CitedProseProps = {
  text: string
  citations: readonly CitationView[]
  body?: string | null
  emptyLabel: string
  onCopyAnnouncement?: (message: string) => void
}

export function CitedProse({ text, citations, body = null, emptyLabel, onCopyAnnouncement }: CitedProseProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const panelId = useId()
  const contextCloseRef = useRef<HTMLButtonElement>(null)
  const footnoteRefs = useRef(new Map<string, HTMLButtonElement>())

  if (!text) {
    return <p className="whitespace-pre-wrap">{emptyLabel}</p>
  }

  const openIndex = citations.findIndex((citation) => citation.id === openId)
  const openCitation = openIndex >= 0 ? citations[openIndex] : null
  const openLabel = openCitation ? `引用${openIndex + 1}` : null
  const excerpt = openCitation?.excerpt ?? ''
  const context = openCitation ? citationBodyContext(body, openCitation) : null
  const excerptIsLong = excerpt.length > LONG_EXCERPT_CHARS
  const shownExcerpt =
    excerptIsLong && !expanded ? `${excerpt.slice(0, LONG_EXCERPT_CHARS).trimEnd()}…` : excerpt

  async function copyExcerpt() {
    const result = await copyText(excerpt)
    onCopyAnnouncement?.(result === 'ok' ? COPY_SUCCESS_ANNOUNCEMENT : COPY_FAILURE_ANNOUNCEMENT)
  }

  function closeContext() {
    setContextOpen(false)
    if (openCitation) requestAnimationFrame(() => footnoteRefs.current.get(openCitation.id)?.focus())
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
                  ref={(element) => {
                    if (element) footnoteRefs.current.set(citation.id, element)
                    else footnoteRefs.current.delete(citation.id)
                  }}
                  type="button"
                  className="tap-target inline-flex min-h-11 min-w-11 items-center justify-center align-super text-xs font-medium text-zinc-600 underline decoration-dotted underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  aria-label={label}
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? panelId : undefined}
                  onClick={() => {
                    setOpenId((current) => (current === citation.id ? null : citation.id))
                    setExpanded(false)
                    setContextOpen(false)
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
              {context ? (
                <Button type="button" variant="secondary" size="sm" aria-expanded={contextOpen}
                  onClick={() => {
                    if (contextOpen) closeContext()
                    else {
                      setContextOpen(true)
                      requestAnimationFrame(() => contextCloseRef.current?.focus())
                    }
                  }}>
                  本文で確認
                </Button>
              ) : null}
              <Button type="button" variant="secondary" size="sm" onClick={() => void copyExcerpt()}>
                コピー
              </Button>
            </div>
          </div>
          <p className="break-anywhere whitespace-pre-wrap">{shownExcerpt}</p>
          {contextOpen && context ? (
            <div role="region" aria-label="本文の該当箇所"
              className="space-y-2 rounded-md border border-border bg-surface-muted p-inset"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  closeContext()
                }
              }}>
              <p className="break-anywhere whitespace-pre-wrap">
                {context.clippedBefore ? '…' : null}{context.before}
                <mark className="bg-amber-200 text-zinc-900 dark:bg-amber-800 dark:text-white">{context.match}</mark>
                {context.after}{context.clippedAfter ? '…' : null}
              </p>
              <Button ref={contextCloseRef} type="button" variant="secondary" size="sm" onClick={closeContext}>
                閉じる
              </Button>
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  )
}
