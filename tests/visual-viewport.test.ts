import { describe, expect, it } from 'vitest'
import {
  APP_KEYBOARD_INSET_VAR,
  APP_VIEWPORT_HEIGHT_VAR,
  APP_VIEWPORT_OFFSET_TOP_VAR,
  appViewportMetrics,
  applyAppViewportCssVars,
  clearAppViewportCssVars,
} from '~/lib/visual-viewport'

describe('appViewportMetrics', () => {
  it('uses layout height when visualViewport is missing', () => {
    expect(appViewportMetrics(null, 844)).toEqual({
      heightPx: 844,
      offsetTopPx: 0,
      keyboardInsetPx: 0,
    })
  })

  it('reports keyboard inset when the visual viewport shrinks', () => {
    expect(appViewportMetrics({ height: 480, offsetTop: 0 }, 844)).toEqual({
      heightPx: 480,
      offsetTopPx: 0,
      keyboardInsetPx: 364,
    })
  })

  it('subtracts offsetTop from the inset so scrolled visual viewports stay honest', () => {
    expect(appViewportMetrics({ height: 480, offsetTop: 40 }, 844)).toEqual({
      heightPx: 480,
      offsetTopPx: 40,
      keyboardInsetPx: 324,
    })
  })
})

describe('applyAppViewportCssVars', () => {
  it('writes and clears the three custom properties', () => {
    const store = new Map<string, string>()
    const style = {
      setProperty(name: string, value: string) {
        store.set(name, value)
      },
      removeProperty(name: string) {
        store.delete(name)
      },
    } as CSSStyleDeclaration

    applyAppViewportCssVars(style, {
      heightPx: 500,
      offsetTopPx: 12,
      keyboardInsetPx: 300,
    })
    expect(store.get(APP_VIEWPORT_HEIGHT_VAR)).toBe('500px')
    expect(store.get(APP_VIEWPORT_OFFSET_TOP_VAR)).toBe('12px')
    expect(store.get(APP_KEYBOARD_INSET_VAR)).toBe('300px')

    clearAppViewportCssVars(style)
    expect(store.size).toBe(0)
  })
})
