import { describe, expect, it } from 'vitest'
import { homeCreateCtaPlacement } from '../src/domain/home'

describe('homeCreateCtaPlacement', () => {
  it('puts 新しいノート in the empty state only when the catalog is empty', () => {
    expect(homeCreateCtaPlacement({ status: 'empty' })).toBe('empty')
    expect(homeCreateCtaPlacement({ status: 'ready', items: ['研究'] })).toBe('header')
    expect(homeCreateCtaPlacement({ status: 'loading' })).toBe('header')
    expect(homeCreateCtaPlacement({ status: 'error' })).toBe('none')
  })
})
