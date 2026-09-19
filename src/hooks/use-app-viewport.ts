import { useEffect } from 'react'
import {
  clearAppViewportCssVars,
  syncAppViewportCssVars,
} from '~/lib/visual-viewport'

/** Keeps --app-height / --app-offset-top / --app-keyboard-inset in sync with visualViewport. */
export function useAppViewportCssVars(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      clearAppViewportCssVars(document.documentElement.style)
      return
    }

    const sync = () => {
      syncAppViewportCssVars()
    }
    sync()

    const vv = window.visualViewport
    window.addEventListener('resize', sync)
    window.addEventListener('orientationchange', sync)
    vv?.addEventListener('resize', sync)
    vv?.addEventListener('scroll', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('orientationchange', sync)
      vv?.removeEventListener('resize', sync)
      vv?.removeEventListener('scroll', sync)
      clearAppViewportCssVars(document.documentElement.style)
    }
  }, [enabled])
}
