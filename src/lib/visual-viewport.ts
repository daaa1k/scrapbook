/**
 * Maps the visual viewport to CSS custom properties so the notebook shell
 * shrinks with the software keyboard instead of leaving controls under it.
 */

export const APP_VIEWPORT_HEIGHT_VAR = '--app-height'
export const APP_VIEWPORT_OFFSET_TOP_VAR = '--app-offset-top'
export const APP_KEYBOARD_INSET_VAR = '--app-keyboard-inset'

export type AppViewportMetrics = {
  heightPx: number
  offsetTopPx: number
  keyboardInsetPx: number
}

export function appViewportMetrics(
  visual: Pick<VisualViewport, 'height' | 'offsetTop'> | null | undefined,
  layoutHeight: number,
): AppViewportMetrics {
  const heightPx = visual?.height ?? layoutHeight
  const offsetTopPx = visual?.offsetTop ?? 0
  return {
    heightPx,
    offsetTopPx,
    keyboardInsetPx: Math.max(0, Math.round(layoutHeight - heightPx - offsetTopPx)),
  }
}

export function applyAppViewportCssVars(
  target: CSSStyleDeclaration,
  metrics: AppViewportMetrics,
): void {
  target.setProperty(APP_VIEWPORT_HEIGHT_VAR, `${metrics.heightPx}px`)
  target.setProperty(APP_VIEWPORT_OFFSET_TOP_VAR, `${metrics.offsetTopPx}px`)
  target.setProperty(APP_KEYBOARD_INSET_VAR, `${metrics.keyboardInsetPx}px`)
}

export function clearAppViewportCssVars(target: CSSStyleDeclaration): void {
  target.removeProperty(APP_VIEWPORT_HEIGHT_VAR)
  target.removeProperty(APP_VIEWPORT_OFFSET_TOP_VAR)
  target.removeProperty(APP_KEYBOARD_INSET_VAR)
}

export function readLayoutViewportHeight(): number {
  return window.innerHeight
}

export function syncAppViewportCssVars(root: HTMLElement = document.documentElement): AppViewportMetrics {
  const metrics = appViewportMetrics(window.visualViewport, readLayoutViewportHeight())
  applyAppViewportCssVars(root.style, metrics)
  return metrics
}

/** Scrolls `el` so it sits inside the visual viewport when the keyboard covers it. */
export function scrollElementIntoVisualViewport(el: Element): void {
  const vv = window.visualViewport
  if (!vv) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    return
  }
  const rect = el.getBoundingClientRect()
  if (rect.top >= 0 && rect.bottom <= vv.height) return
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
