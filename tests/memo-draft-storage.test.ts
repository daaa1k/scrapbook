import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearLocalMemoDraft,
  memoDraftStorageKey,
  readLocalMemoDraft,
  shouldOfferMemoDraftRestore,
  writeLocalMemoDraft,
} from '../src/domain/memo-draft-storage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('memo draft storage', () => {
  it('retains an empty unsaved draft until explicit clear', () => {
    const values = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    })

    writeLocalMemoDraft('source-1', '')
    expect(values.has(memoDraftStorageKey('source-1'))).toBe(true)
    expect(readLocalMemoDraft('source-1')).toBe('')
    expect(shouldOfferMemoDraftRestore('saved memo', readLocalMemoDraft('source-1'), true)).toBe(true)

    clearLocalMemoDraft('source-1')
    expect(readLocalMemoDraft('source-1')).toBeNull()
  })

  it('offers a draft when the loaded server memo is empty and avoids duplicate offers', () => {
    expect(shouldOfferMemoDraftRestore('', 'local memo', true)).toBe(true)
    expect(shouldOfferMemoDraftRestore('saved memo', 'saved memo', true)).toBe(false)
    expect(shouldOfferMemoDraftRestore('', null, true)).toBe(false)
  })
})
