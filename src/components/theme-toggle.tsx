import { useEffect, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import {
  applyThemePreference,
  applySystemThemeChange,
  cycleThemePreference,
  readStoredThemePreference,
  themePreferenceLabel,
  type ThemePreference,
} from '~/lib/theme'

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>('system')
  const preferenceRef = useRef<ThemePreference>('system')

  useEffect(() => {
    const initial = readStoredThemePreference()
    preferenceRef.current = initial
    setPreference(initial)
    applyThemePreference(initial)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function onSystemChange() {
      applySystemThemeChange(preferenceRef.current)
    }
    media.addEventListener('change', onSystemChange)
    return () => media.removeEventListener('change', onSystemChange)
  }, [])

  function onCycle() {
    const next = cycleThemePreference(preferenceRef.current)
    preferenceRef.current = next
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
      aria-label={`Theme: ${label}. Click to switch`}
      title={`Theme: ${label}`}
    >
      {label}
    </Button>
  )
}
