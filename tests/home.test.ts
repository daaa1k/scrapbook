import { describe, expect, it } from 'vitest'
import {
  filterHomeNotebooks,
  homeCreateCtaPlacement,
  homeDensityLabel,
  isHomeDensity,
  presentHomeNotebooks,
  sortHomeNotebooks,
} from '../src/domain/home'
import { notebookIdSchema, notebookTitleSchema } from '../src/domain/organization'

const a = {
  id: notebookIdSchema.parse('550e8400-e29b-41d4-a716-446655440000'),
  title: notebookTitleSchema.parse('研究ノート'),
  sourceCount: 2,
  updatedAt: 200,
}
const b = {
  id: notebookIdSchema.parse('660e8400-e29b-41d4-a716-446655440000'),
  title: notebookTitleSchema.parse('アイデア'),
  sourceCount: 0,
  updatedAt: 100,
}
const c = {
  id: notebookIdSchema.parse('770e8400-e29b-41d4-a716-446655440000'),
  title: notebookTitleSchema.parse('研究メモ'),
  sourceCount: 1,
  updatedAt: 300,
}

describe('homeCreateCtaPlacement', () => {
  it('puts 新しいノート in the empty state only when the catalog is empty', () => {
    expect(homeCreateCtaPlacement({ status: 'empty' })).toBe('empty')
    expect(homeCreateCtaPlacement({ status: 'ready', items: ['研究'] })).toBe('header')
    expect(homeCreateCtaPlacement({ status: 'loading' })).toBe('header')
    expect(homeCreateCtaPlacement({ status: 'error' })).toBe('none')
  })
})

describe('home list controls', () => {
  it('filters notebooks by title substring', () => {
    expect(filterHomeNotebooks([a, b, c], '研究').map((n) => n.title)).toEqual([
      '研究ノート',
      '研究メモ',
    ])
    expect(filterHomeNotebooks([a, b, c], '  ').map((n) => n.id)).toEqual([a.id, b.id, c.id])
  })

  it('sorts by updated and name', () => {
    expect(sortHomeNotebooks([a, b, c], 'updated').map((n) => n.title)).toEqual([
      '研究メモ',
      '研究ノート',
      'アイデア',
    ])
    expect(sortHomeNotebooks([a, b, c], 'name').map((n) => n.title)).toEqual([
      'アイデア',
      '研究ノート',
      '研究メモ',
    ])
  })

  it('presents filtered then sorted notebooks', () => {
    expect(presentHomeNotebooks([a, b, c], '研究', 'updated').map((n) => n.title)).toEqual([
      '研究メモ',
      '研究ノート',
    ])
  })

  it('validates density preference', () => {
    expect(isHomeDensity('compact')).toBe(true)
    expect(isHomeDensity('wide')).toBe(false)
    expect(homeDensityLabel('compact')).toBe('コンパクト')
  })
})
