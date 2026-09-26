import { expect, test } from '@playwright/test'
import { test as notebookTest, FIRST_SOURCE, SECOND_SOURCE, sourceButton } from './fixtures/notebook'

test.describe('visual regression', () => {
  test('home chrome desktop light', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await expect(page.locator('header')).toHaveScreenshot('home-chrome-desktop.png', {
      // CI and local machines render the system font differently.
      maxDiffPixelRatio: 0.1,
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
    await expect(page.locator('header')).toHaveScreenshot('home-chrome-mobile.png', {
      maxDiffPixelRatio: 0.1,
    })
  })
})

notebookTest('fixed notebook workspace desktop light', async ({ page, notebook }) => {
  await page.goto(`${notebook.path}?sourceId=${notebook.firstSourceId}`)
  const study = page.getByRole('tabpanel', { name: '要約・質問' })
  const memo = page.getByRole('tabpanel', { name: 'メモ' })
  await expect(sourceButton(page, FIRST_SOURCE)).toBeVisible()
  await expect(sourceButton(page, SECOND_SOURCE)).toBeVisible()
  await expect(study.getByText('まだ質問はありません')).toBeVisible()
  await expect(memo.getByRole('textbox', { name: 'ソースのメモ' })).toBeVisible()
  await expect(study.locator('..')).toHaveScreenshot('notebook-workspace-desktop.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.03,
  })
})
