import { describe, expect, it } from 'vitest'
import { resumableSourceId } from '../src/domain/last-source-selection'

describe('resumableSourceId', () => {
  it('uses a stored selection only while it belongs to the notebook', () => {
    expect(resumableSourceId('old', ['new', 'old'])).toBe('old')
    expect(resumableSourceId('deleted', ['new', 'old'])).toBeNull()
    expect(resumableSourceId(null, ['new'])).toBeNull()
  })
})
