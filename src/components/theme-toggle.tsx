import { useEffect, useState } from 'react'
import { Button } from '~/components/ui/button'
import {
  applyThemePreference,
  cycleThemePreference,
  readStoredThemePreference,
  themePreferenceLabel,
  type ThemePreference,
} from '~/lib/theme'

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system')

  useEffect(() => {
    const initial = readStoredThemePreference()
    setPreference(initial)
    applyThemePreference(initial)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function onSystemChange() {
      const pref = readStoredThemePreference()
      if (pref === 'system') applyThemePreference('system')
    }
    media.addEventListener('change', onSystemChange)
    return () => media.removeEventListener('change', onSystemChange)
  }, [])

  function onCycle() {
    const next = cycleThemePreference(preference)
    setPreference(next)
    applyThemePreference(next)
  }

  const label = themePreferenceLabel(preference)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onCycle}
      aria-label={`テーマ: ${label}。クリックで切り替え`}
      title={`テーマ: ${label}`}
    >
      {label}
    </Button>
  )
}
