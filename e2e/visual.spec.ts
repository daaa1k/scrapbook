import { expect, test } from '@playwright/test'

test.describe('visual regression', () => {
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

})
