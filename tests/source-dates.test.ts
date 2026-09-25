import { describe, expect, it } from 'vitest'
import { sourceBodyDateLabel, sourceDateTime } from '../src/domain/source-dates'

describe('source dates', () => {
  it('shows an absolute time in a fixed timezone', () => {
    expect(sourceDateTime(Date.parse('2025-01-01T00:30:00Z'))).toEqual({
      label: '2025/01/01 09:30 JST',
      dateTime: '2025-01-01T00:30:00.000Z',
    })
    expect(sourceDateTime(0)).toEqual({ label: '1970/01/01 09:00 JST', dateTime: '1970-01-01T00:00:00.000Z' })
  })

  it('treats missing and invalid timestamps as unknown', () => {
    for (const value of [null, NaN, Infinity, -Infinity, 9e15]) {
      expect(sourceDateTime(value)).toBeNull()
    }
  })

  it('names the stored body event from its acquisition method', () => {
    expect(sourceBodyDateLabel('fetch')).toBe('本文の取得日時')
    expect(sourceBodyDateLabel('paste')).toBe('本文の貼付日時')
    expect(sourceBodyDateLabel('upload')).toBe('本文の抽出日時')
  })
})
