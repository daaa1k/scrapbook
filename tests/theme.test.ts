import { describe, expect, it } from 'vitest'
import {
  cycleThemePreference,
  isThemePreference,
  resolveTheme,
  themePreferenceLabel,
} from '~/lib/theme'

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

  it('labels preferences in Japanese', () => {
    expect(themePreferenceLabel('system')).toBe('システム')
    expect(themePreferenceLabel('light')).toBe('ライト')
    expect(themePreferenceLabel('dark')).toBe('ダーク')
  })

  it('accepts only known preference strings', () => {
    expect(isThemePreference('system')).toBe(true)
    expect(isThemePreference('auto')).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })
})
