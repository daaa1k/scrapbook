import { describe, expect, it } from 'vitest'
import { qaDeleteConfirm } from '../src/domain/destructive-confirm'

describe('qaDeleteConfirm', () => {
  it('clips a long question to 40 characters', () => {
    const question = 'あ'.repeat(41)
    expect(qaDeleteConfirm(question).description).toContain(`${'あ'.repeat(40)}…`)
  })
})
