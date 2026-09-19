import { expect, test } from '@playwright/test'

test.describe('visual regression', () => {
  test('home desktop light', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await expect(page).toHaveScreenshot('home-desktop-light.png', {
      fullPage: true,
      mask: [page.locator('text=/更新 /')],
    })
  })

  test('create dialog desktop', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '新しいノート' }).click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog.getByRole('heading', { name: '新しいノート' })).toBeVisible({ timeout: 15_000 })
    await expect(dialog).toHaveScreenshot('source-add-dialog.png')
  })

  test('home mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await expect(page).toHaveScreenshot('home-mobile.png', {
      fullPage: true,
      mask: [page.locator('text=/更新 /')],
    })
  })
})
