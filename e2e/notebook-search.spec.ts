import { expect, test, type Page } from '@playwright/test'

async function addPasteSource(page: Page, title: string, fromHome = false, body = `${title} の本文です。`) {
  const addButton = page.getByRole('button', { name: fromHome ? '新しいノート' : 'ソースを追加' }).first()
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await addButton.click()
    await expect(dialog).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30_000 })
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル', { exact: true }).fill(title)
  await dialog.getByLabel('本文', { exact: true }).fill(body)
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

test('search shows a safe excerpt for body matches and keeps source selection usable', async ({ page }) => {
  const suffix = Date.now().toString(36)
  const bodyTitle = `Issue95 Body ${suffix}`
  const titleMatch = `Issue95 MIXED ${suffix}`
  await page.goto('/')
  await addPasteSource(page, bodyTitle, true, `${'前置き '.repeat(30)}<script>needle</script> 100%_SAFE`)
  await addPasteSource(page, titleMatch, false, '別の本文')

  const search = page.getByRole('searchbox', { name: '検索' })
  const panel = page.locator('#notebook-panel-sources')
  await search.fill('needle')
  await expect(sourceButton(page, bodyTitle)).toBeVisible()
  await expect(panel.locator('p').filter({ hasText: '本文:' })).toBeVisible()
  await expect(panel.locator('mark')).toHaveText('needle')
  await sourceButton(page, bodyTitle).click()
  await expect(sourceButton(page, bodyTitle)).toHaveAttribute('aria-current', 'true')

  await search.fill('<script>')
  await expect(panel.locator('mark')).toHaveText('<script>')
  await expect(panel.locator('script')).toHaveCount(0)
  await search.fill('100%_')
  await expect(panel.locator('mark')).toHaveText('100%_')
  await search.fill('mixed')
  await expect(sourceButton(page, titleMatch)).toBeVisible()
  await expect(panel.locator('mark')).toHaveText('MIXED')
  await search.fill('')
  await expect(panel.locator('mark')).toHaveCount(0)
})
