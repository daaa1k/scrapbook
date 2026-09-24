export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'scrapbook-theme'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark = typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches,
): ResolvedTheme {
  if (preference === 'light') return 'light'
  if (preference === 'dark') return 'dark'
  return systemDark ? 'dark' : 'light'
}

export function readStoredThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(raw) ? raw : 'system'
  } catch {
    return 'system'
  }
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(preference)
  const root = document.documentElement
  root.dataset.theme = resolved
  root.dataset.themePref = preference
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // private mode / blocked storage — preference still applies for this session
  }
}

export function applySystemThemeChange(preference: ThemePreference) {
  if (preference === 'system') applyThemePreference('system')
}

export function cycleThemePreference(current: ThemePreference): ThemePreference {
  if (current === 'system') return 'light'
  if (current === 'light') return 'dark'
  return 'system'
}

export function themePreferenceLabel(preference: ThemePreference): string {
  if (preference === 'light') return 'Light'
  if (preference === 'dark') return 'Dark'
  return 'System'
}

/** Inline boot script: resolve theme before first paint to avoid flash. */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var p=localStorage.getItem(k);if(p!=='light'&&p!=='dark'&&p!=='system')p='system';var dark=window.matchMedia('(prefers-color-scheme: dark)').matches;var r=p==='light'?'light':p==='dark'?'dark':(dark?'dark':'light');var el=document.documentElement;el.setAttribute('data-theme',r);el.setAttribute('data-theme-pref',p);}catch(e){document.documentElement.setAttribute('data-theme','light');document.documentElement.setAttribute('data-theme-pref','system');}})();`
