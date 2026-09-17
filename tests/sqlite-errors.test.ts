import { describe, expect, it } from 'vitest'
import { isUniqueConstraintError } from '../src/lib/sqlite-errors'

class WrappedLikeDrizzle extends Error {
  constructor(cause: unknown) {
    super('Failed query: update "notebooks" set "title" = ?\nparams: x')
    this.cause = cause
  }
}

describe('isUniqueConstraintError', () => {
  it('matches raw UNIQUE constraint messages', () => {
    expect(isUniqueConstraintError(new Error('UNIQUE constraint failed: notebooks.title'))).toBe(true)
  })

  it('walks Error.cause for D1 DrizzleQueryError wrappers', () => {
    const wrapped = new WrappedLikeDrizzle(
      new Error('D1_ERROR: UNIQUE constraint failed: notebooks.title: SQLITE_CONSTRAINT'),
    )
    expect(isUniqueConstraintError(wrapped)).toBe(true)
  })

  it('rejects unrelated wrapped errors and non-errors', () => {
    expect(isUniqueConstraintError(new WrappedLikeDrizzle(new Error('no such table')))).toBe(false)
    expect(isUniqueConstraintError('UNIQUE constraint failed')).toBe(false)
    expect(isUniqueConstraintError(null)).toBe(false)
  })
})
