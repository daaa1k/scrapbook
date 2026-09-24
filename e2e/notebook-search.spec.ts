import { expect, test, type Page } from '@playwright/test'

async function addPasteSource(page: Page, title: string, fromHome = false) {
  const addButton = page.getByRole('button', { name: fromHome ? '新しいノート' : 'ソースを追加' }).first()
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await addButton.click()
    await expect(dialog).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30_000 })
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル', { exact: true }).fill(title)
  await dialog.getByLabel('本文', { exact: true }).fill(`${title} の本文です。`)
  await dialog.getByRole('button', { name: '本文を保存' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(sourceButton(page, title)).toBeVisible()
  await expect(sourceButton(page, title)).toHaveAttribute('aria-current', 'true')
}

function sourceButton(page: Page, title: string) {
  return page.locator('#notebook-panel-sources button[title]').filter({ hasText: title })
}

test('search keeps its input, selected source, and memo through loading, zero results, and errors', async ({ page }) => {
  test.setTimeout(120_000)
  const suffix = Date.now().toString(36)
  const first = `Issue65 Alpha ${suffix}`
  const selected = `Issue65 Beta ${suffix}`
  await page.goto('/')
  await addPasteSource(page, first, true)
  await addPasteSource(page, selected)
  await expect(page).toHaveURL(/sourceId=/)

  const selectedUrl = page.url()
  const memo = page.getByRole('textbox', { name: 'ソースのメモ' })
  await expect(memo).toBeVisible()
  await page.waitForTimeout(1000)
  const search = page.getByRole('searchbox', { name: '検索' })
  let delayed = 0
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'fetch') {
      delayed += 1
      await new Promise((resolve) => setTimeout(resolve, 800))
    }
    await route.continue()
  })

  await search.focus()
  await search.pressSequentially('Alpha', { delay: 40 })
  await expect(search).toBeFocused()
  await expect(memo).toBeVisible()
  await expect(page).toHaveURL(selectedUrl)
  await expect(sourceButton(page, first)).toBeVisible()
  await expect(sourceButton(page, selected)).toHaveCount(0)
  expect(delayed).toBeGreaterThan(0)

  await search.fill(`missing-${suffix}`)
  await expect(search).toBeFocused()
  await expect(page.getByText(`「missing-${suffix}」に一致するソースはありません`)).toBeVisible()
  await expect(memo).toBeVisible()
  await expect(page).toHaveURL(selectedUrl)
  await page.unrouteAll({ behavior: 'wait' })

  await memo.fill(`unsaved memo ${suffix}`)
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() === 'fetch') await route.abort()
    else await route.continue()
  })
  await search.fill(`failure-${suffix}`)
  await expect(page.getByText('保存失敗')).toBeVisible()
  await expect(page.locator('#notebook-panel-sources').getByRole('button', { name: '再試行' })).toBeVisible({ timeout: 20_000 })
  await expect(memo).toHaveValue(`unsaved memo ${suffix}`)
  await expect(page).toHaveURL(selectedUrl)
})
