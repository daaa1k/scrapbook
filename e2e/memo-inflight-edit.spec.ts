import { expect, test } from '@playwright/test'

test('keeps edits made during a memo save until their own save succeeds', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  const create = page.getByRole('button', { name: '新しいノート' })
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await create.click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル').fill(`In-flight memo ${Date.now()}`)
  await dialog.getByLabel('本文').fill('Source body')
  await dialog.getByRole('button', { name: '本文を保存' }).click()

  const memo = page.getByRole('textbox', { name: 'ソースのメモ' })
  await expect(memo).toBeVisible()
  const sourceId = new URL(page.url()).searchParams.get('sourceId')
  expect(sourceId).toBeTruthy()
  const draftKey = `scrapbook-memo-draft:${sourceId}`

  let releaseFirstSave!: () => void
  let firstSaveStarted!: () => void
  const firstSaveGate = new Promise<void>((resolve) => { releaseFirstSave = resolve })
  const firstSaveSeen = new Promise<void>((resolve) => { firstSaveStarted = resolve })
  let saveCount = 0
  await page.route('**/_serverFn/**', async (route) => {
    const encoded = new URL(route.request().url()).pathname.split('/_serverFn/')[1]
    if (!encoded || !Buffer.from(encoded, 'base64url').toString('utf8').includes('runOrganizationCommand')) {
      return route.continue()
    }
    saveCount++
    if (saveCount === 1) {
      firstSaveStarted()
      await firstSaveGate
    }
    await route.continue()
  })

  await memo.fill('A')
  await firstSaveSeen
  await memo.fill('AB')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe('AB')
  releaseFirstSave()
  await expect(page.locator('#memo-save-status')).toHaveText('未保存')
  expect(await page.evaluate((key) => localStorage.getItem(key), draftKey)).toBe('AB')
  await expect(page.locator('#memo-save-status')).toHaveText('保存済み')
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), draftKey)).toBeNull()
  expect(saveCount).toBe(2)
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'ソースのメモ' })).toHaveValue('AB')
})
