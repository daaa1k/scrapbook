import { describe, expect, it } from 'vitest'
import {
  canHandleNoteShortcut,
  isModEnter,
  isShortcutHelpKey,
  isTypingTarget,
  sourceNavDirection,
} from '../src/domain/shortcuts'

describe('shortcuts', () => {
  it('detects mod+enter and source nav keys', () => {
    expect(isModEnter({ key: 'Enter', metaKey: true, ctrlKey: false })).toBe(true)
    expect(isModEnter({ key: 'Enter', metaKey: false, ctrlKey: false })).toBe(false)
    expect(sourceNavDirection({ key: 'j', metaKey: false, ctrlKey: false, altKey: false })).toBe(
      'next',
    )
    expect(sourceNavDirection({ key: 'k', metaKey: false, ctrlKey: false, altKey: false })).toBe(
      'prev',
    )
    expect(isShortcutHelpKey({ key: '?', metaKey: false, ctrlKey: false, altKey: false })).toBe(true)
  })

  it('treats form fields as typing targets', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false)
    expect(isTypingTarget({ isContentEditable: true })).toBe(true)
  })

  it('limits note shortcuts to an unmodified key outside modal dialogs and editors', () => {
    const event = {
      defaultPrevented: false,
      isComposing: false,
      target: { tagName: 'BUTTON' },
      metaKey: false,
      ctrlKey: false,
      altKey: false,
    }
    expect(canHandleNoteShortcut(event, false)).toBe(true)
    expect(canHandleNoteShortcut(event, true)).toBe(false)
    expect(canHandleNoteShortcut({ ...event, defaultPrevented: true }, false)).toBe(false)
    expect(canHandleNoteShortcut({ ...event, isComposing: true }, false)).toBe(false)
    expect(canHandleNoteShortcut({ ...event, target: { tagName: 'INPUT' } }, false)).toBe(false)
    expect(canHandleNoteShortcut({ ...event, target: { isContentEditable: true } }, false)).toBe(false)
    for (const modifier of ['metaKey', 'ctrlKey', 'altKey'] as const) {
      expect(canHandleNoteShortcut({ ...event, [modifier]: true }, false)).toBe(false)
    }
  })
})
