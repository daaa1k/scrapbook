import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applySystemThemeChange,
  applyThemePreference,
  cycleThemePreference,
  isThemePreference,
  readStoredThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  themePreferenceLabel,
} from '~/lib/theme'

afterEach(() => vi.unstubAllGlobals())

describe('theme preference', () => {
  it('resolves system from the media query', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('cycles system → light → dark → system', () => {
    expect(cycleThemePreference('system')).toBe('light')
    expect(cycleThemePreference('light')).toBe('dark')
    expect(cycleThemePreference('dark')).toBe('system')
  })

  it('labels preferences in English', () => {
    expect(themePreferenceLabel('system')).toBe('System')
    expect(themePreferenceLabel('light')).toBe('Light')
    expect(themePreferenceLabel('dark')).toBe('Dark')
  })

  it('accepts only known preference strings', () => {
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('auto')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })

  it('keeps explicit preferences when storage is blocked and the OS theme changes', () => {
    let systemDark = false
    const dataset: Record<string, string> = {}
    const getItem = vi.fn(() => {
      throw new Error('storage denied')
    })
    const setItem = vi.fn(() => {
      throw new Error('storage denied')
    })
    vi.stubGlobal('window', {
      localStorage: { getItem, setItem },
      matchMedia: () => ({ matches: systemDark }),
    })
    vi.stubGlobal('document', { documentElement: { dataset } })

    expect(readStoredThemePreference()).toBe('system')
    applyThemePreference('light')
    systemDark = true
    applySystemThemeChange('light')
    expect(dataset).toMatchObject({ theme: 'light', themePref: 'light' })

    applyThemePreference('dark')
    systemDark = false
    applySystemThemeChange('dark')
    expect(dataset).toMatchObject({ theme: 'dark', themePref: 'dark' })
    expect(getItem).toHaveBeenCalledTimes(1)

    applyThemePreference('system')
    systemDark = true
    applySystemThemeChange('system')
    expect(dataset).toMatchObject({ theme: 'dark', themePref: 'system' })
    systemDark = false
    applySystemThemeChange('system')
    expect(dataset).toMatchObject({ theme: 'light', themePref: 'system' })
    expect(setItem).toHaveBeenCalled()
  })

  it('restores a saved preference after a new read', () => {
    let saved: string | null = null
    const dataset: Record<string, string> = {}
    const getItem = vi.fn((_key: string) => saved)
    const setItem = vi.fn((_key: string, value: string) => { saved = value })
    vi.stubGlobal('window', {
      localStorage: { getItem, setItem },
      matchMedia: () => ({ matches: true }),
    })
    vi.stubGlobal('document', { documentElement: { dataset } })

    applyThemePreference('light')
    expect(saved).toBe('light')
    expect(readStoredThemePreference()).toBe('light')
    expect(dataset).toMatchObject({ theme: 'light', themePref: 'light' })
    expect(getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY)
    expect(setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light')
  })
})
