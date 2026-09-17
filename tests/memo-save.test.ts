import { describe, expect, it } from 'vitest'
import { shouldSaveMemo } from '../src/domain/memo-save'

describe('shouldSaveMemo', () => {
  it('skips save when draft matches the last saved value', () => {
    expect(shouldSaveMemo('hello', 'hello')).toBe(false)
    expect(shouldSaveMemo('', null)).toBe(false)
    expect(shouldSaveMemo('', '')).toBe(false)
  })

  it('saves when draft differs from the last saved value', () => {
    expect(shouldSaveMemo('hello', '')).toBe(true)
    expect(shouldSaveMemo('hello', null)).toBe(true)
    expect(shouldSaveMemo('next', 'prev')).toBe(true)
  })
})
