import { expect, test } from '@playwright/test'

test.describe('visual regression', () => {
  test('home chrome desktop light', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    // Catalog contents vary by local D1; compare brand + page chrome only.
    await expect(page.locator('body > div').first()).toHaveScreenshot('home-chrome-desktop.png', {
      animations: 'disabled',
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
    await expect(page.locator('body > div').first()).toHaveScreenshot('home-chrome-mobile.png', {
      animations: 'disabled',
      mask: [page.locator('main')],
    })
  })
})
