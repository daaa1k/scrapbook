import { describe, expect, it, vi } from 'vitest'

vi.mock('web-vitals', () => ({
  onCLS: (cb: (m: unknown) => void) =>
    cb({ name: 'CLS', value: 0.01, id: 'cls', rating: 'good' }),
  onINP: (cb: (m: unknown) => void) =>
    cb({ name: 'INP', value: 40, id: 'inp', rating: 'good' }),
  onLCP: (cb: (m: unknown) => void) =>
    cb({ name: 'LCP', value: 1200, id: 'lcp', rating: 'good' }),
  onFCP: (cb: (m: unknown) => void) =>
    cb({ name: 'FCP', value: 800, id: 'fcp', rating: 'good' }),
  onTTFB: (cb: (m: unknown) => void) =>
    cb({ name: 'TTFB', value: 100, id: 'ttfb', rating: 'good' }),
}))

describe('startWebVitalsReporting', () => {
  it('records metrics on the window bag', async () => {
    vi.resetModules()
    const bagHost = { __scrapbookWebVitals: undefined as unknown }
    vi.stubGlobal('window', bagHost)
    const { startWebVitalsReporting } = await import('../src/lib/web-vitals')
    startWebVitalsReporting()
    expect(bagHost.__scrapbookWebVitals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'LCP', value: 1200 }),
        expect.objectContaining({ name: 'TTFB', value: 100 }),
      ]),
    )
    vi.unstubAllGlobals()
  })
})
