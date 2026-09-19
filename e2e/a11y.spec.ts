import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

async function assertNoCriticalOrSerious(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  )
  expect(blocking, `${label}: critical/serious axe violations`).toEqual([])
}

test.describe('axe critical/serious = 0', () => {
  test('home light', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await assertNoCriticalOrSerious(page, 'home-light')
  })

  test('home dark', async ({ page }) => {
    await page.goto('/')
    const theme = page.getByRole('button', { name: /テーマ:/ })
    await theme.click()
    await theme.click()
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await assertNoCriticalOrSerious(page, 'home-dark')
  })

  test('create notebook dialog', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '新しいノート' }).click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog.getByRole('heading', { name: '新しいノート' })).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByRole('tablist', { name: '入力方法' })).toBeVisible()
    await assertNoCriticalOrSerious(page, 'source-add-dialog')
  })
})
