import { expect, test } from '@playwright/test'

/**
 * Home shots use the viewport (not fullPage / not a tall content root).
 * Catalog rows live under `main` and vary by local D1 size — mask them so
 * empty CI migrate and seeded local DBs share the same chrome baseline.
 */
const homeShot = {
  animations: 'disabled' as const,
  fullPage: false,
}

test.describe('visual regression', () => {
  test('home chrome desktop light', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await expect(page).toHaveScreenshot('home-chrome-desktop.png', {
      ...homeShot,
      mask: [page.locator('main')],
    })
  })

  test('create dialog desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '新しいノート' }).click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog.getByRole('heading', { name: '新しいノート' })).toBeVisible({ timeout: 15_000 })
    await expect(dialog).toHaveScreenshot('source-add-dialog.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.03,
    })
  })

  test('home chrome mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await expect(page).toHaveScreenshot('home-chrome-mobile.png', {
      ...homeShot,
      mask: [page.locator('main')],
    })
  })
})
