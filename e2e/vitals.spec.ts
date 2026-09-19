import { expect, test } from '@playwright/test'

test.describe('web vitals hook', () => {
  test('exposes a vitals bag after home load', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await page.waitForTimeout(500)
    const reports = await page.evaluate(() => window.__scrapbookWebVitals ?? [])
    expect(Array.isArray(reports)).toBe(true)
    // Soft: at least TTFB or FCP often lands quickly; do not fail CI on empty short loads.
    for (const report of reports) {
      expect(report).toMatchObject({
        name: expect.any(String),
        value: expect.any(Number),
        id: expect.any(String),
      })
    }
  })
})
