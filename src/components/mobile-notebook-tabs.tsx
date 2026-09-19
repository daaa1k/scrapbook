import { useSyncExternalStore, type KeyboardEvent } from 'react'
import {
  NOTEBOOK_MOBILE_TABS,
  notebookLayoutModeFromMatches,
  notebookTabId,
  notebookPanelId,
  paneAfterTabKey,
  type NotebookLayoutMode,
  type NotebookMobilePane,
} from '~/domain/note-shell'
import { cn } from '~/lib/utils'

const MD_MEDIA = '(min-width: 48rem)'
const LG_MEDIA = '(min-width: 64rem)'

function subscribeMedia(query: string, onStoreChange: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

function mediaMatches(query: string) {
  return window.matchMedia(query).matches
}

export function useNotebookLayoutMode(): NotebookLayoutMode {
  const md = useSyncExternalStore(
    (onStoreChange) => subscribeMedia(MD_MEDIA, onStoreChange),
    () => mediaMatches(MD_MEDIA),
    () => false,
  )
  const lg = useSyncExternalStore(
    (onStoreChange) => subscribeMedia(LG_MEDIA, onStoreChange),
    () => mediaMatches(LG_MEDIA),
    () => false,
  )
  return notebookLayoutModeFromMatches(md, lg)
}

/** True when the shell uses the phone tablist (below md). */
export function useCompactNotebookLayout() {
  return useNotebookLayoutMode() === 'tabs'
}

export function focusNotebookTab(pane: NotebookMobilePane) {
  document.getElementById(notebookTabId(pane))?.focus()
}

export function notebookPanelConcealmentProps(concealed: boolean) {
  return {
    hidden: concealed,
    'aria-hidden': concealed ? true : undefined,
    inert: concealed ? true : undefined,
  }
}

type MobileNotebookTabsProps = {
  selected: NotebookMobilePane
  onSelect: (pane: NotebookMobilePane) => void
}

export function MobileNotebookTabs({ selected, onSelect }: MobileNotebookTabsProps) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = paneAfterTabKey(selected, event.key)
    if (!next) return
    event.preventDefault()
    onSelect(next)
    focusNotebookTab(next)
  }

  return (
    <div
      className="sticky top-0 z-10 grid w-full shrink-0 grid-cols-3 border-b border-zinc-200 bg-zinc-50 md:hidden dark:border-zinc-800 dark:bg-zinc-950"
      role="tablist"
      aria-label="ノートの表示切替"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
    >
      {NOTEBOOK_MOBILE_TABS.map((tab) => {
        const isSelected = selected === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={notebookTabId(tab.id)}
            aria-controls={notebookPanelId(tab.id)}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            className={cn(
              'tap-target relative flex min-h-11 items-center justify-center px-2 text-sm',
              isSelected
                ? 'bg-zinc-900 font-bold text-zinc-50 after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:rounded-t-sm after:bg-zinc-50 dark:bg-zinc-100 dark:text-zinc-900 dark:after:bg-zinc-900'
                : 'font-medium text-zinc-600 dark:text-zinc-400',
            )}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
