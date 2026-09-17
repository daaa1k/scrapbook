import { describe, expect, it } from 'vitest'
import { normalizeUrl, parseAndNormalizeUrl, registerUrlInputSchema, sourceKindFromUrl } from '../src/domain/url'

describe('URL normalization', () => {
  it('lowercases host, strips default port, hash, and trailing slash', () => {
    expect(normalizeUrl('HTTPS://Example.COM:443/a/b/?q=1#frag')).toBe('https://example.com/a/b?q=1')
  })

  it('keeps root slash', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })

  it('rejects non-http protocols', () => {
    expect(() => normalizeUrl('ftp://example.com/file')).toThrow('unsupported_protocol')
  })

  it('marks twitter/x URLs as kind x', () => {
    expect(sourceKindFromUrl('https://x.com/foo')).toBe('x')
    expect(sourceKindFromUrl('https://www.twitter.com/foo')).toBe('x')
    const parsed = parseAndNormalizeUrl('HTTPS://Example.COM/post/')
    expect(parsed.kind).toBe('url')
    expect(parsed.original).toBe('HTTPS://Example.COM/post/')
    expect(parsed.normalized).toBe('https://example.com/post')
  })

  it('rejects non-URL strings at the Zod boundary', () => {
    const notebookId = '11111111-1111-4111-8111-111111111111'
    expect(registerUrlInputSchema.safeParse({ url: 'not-a-url', notebookId }).success).toBe(false)
    expect(registerUrlInputSchema.safeParse({ url: 'https://example.com/ok' }).success).toBe(false)
    expect(registerUrlInputSchema.safeParse({ url: 'https://example.com/ok', notebookId }).success).toBe(true)
  })
})
