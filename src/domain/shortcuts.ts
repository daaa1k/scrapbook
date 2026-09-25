export type ShortcutMod = 'none' | 'mod' | 'shift'

export type ShortcutDefinition = {
  id: string
  keys: string
  when: string
  description: string
}

export const SHORTCUT_HELP_TITLE = 'キーボードショートカット'
export const SHORTCUT_HELP_TRIGGER_LABEL = 'ショートカット'

export const APP_SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    id: 'ask-submit',
    keys: '⌘/Ctrl + Enter',
    when: '質問入力',
    description: '質問を送信する',
  },
  {
    id: 'source-prev',
    keys: 'K または [',
    when: 'ノート画面（ダイアログ・入力欄以外）',
    description: '前のソースへ移動',
  },
  {
    id: 'source-next',
    keys: 'J または ]',
    when: 'ノート画面（ダイアログ・入力欄以外）',
    description: '次のソースへ移動',
  },
  {
    id: 'help',
    keys: '?',
    when: 'ノート画面（ダイアログ・入力欄以外）',
    description: 'ショートカット一覧を開く',
  },
  {
    id: 'qa-latest',
    keys: '（ボタン）',
    when: '要約・質問',
    description: '最新の回答へスクロール',
  },
]

export function isTypingTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as { tagName?: string; isContentEditable?: boolean }
  if (el.isContentEditable) return true
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function canHandleNoteShortcut(event: {
  defaultPrevented: boolean
  isComposing: boolean
  target: unknown
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}, modalOpen: boolean): boolean {
  return !modalOpen && !event.defaultPrevented && !event.isComposing &&
    !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)
}

export function isModEnter(event: { key: string; metaKey: boolean; ctrlKey: boolean }): boolean {
  return event.key === 'Enter' && (event.metaKey || event.ctrlKey)
}

export function sourceNavDirection(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}): 'prev' | 'next' | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  if (event.key === 'j' || event.key === ']') return 'next'
  if (event.key === 'k' || event.key === '[') return 'prev'
  return null
}

export function isShortcutHelpKey(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  return event.key === '?' || (event.key === '/' && false)
}
