import { expect, test, type Page } from '@playwright/test'

const draftKey = (sourceId: string) => `scrapbook-memo-draft:${sourceId}`

function isSourceDetailRequest(url: string): boolean {
  const encoded = new URL(url).pathname.split('/_serverFn/')[1]
  if (!encoded) return false
  return Buffer.from(encoded, 'base64url').toString('utf8').includes('getSource_createServerFn_handler')
}

async function openNewNotebookDialog(page: Page): Promise<void> {
  const create = page.getByRole('button', { name: '新しいノート' })
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await create.click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
}

test('restores, discards, and saves a local memo draft', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/')
  await openNewNotebookDialog(page)
  const dialog = page.locator('dialog[open]')
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル').fill(`Memo draft ${Date.now()}`)
  await dialog.getByLabel('本文').fill('Memo draft test source body')
  await dialog.getByRole('button', { name: '本文を保存' }).click()

  const memo = page.getByRole('textbox', { name: 'ソースのメモ' })
  await expect(memo).toBeVisible()
  const notebookPath = new URL(page.url()).pathname
  const sourceId = new URL(page.url()).searchParams.get('sourceId')
  expect(sourceId).toBeTruthy()
  const key = draftKey(sourceId!)

  await page.evaluate(([storageKey, value]) => localStorage.setItem(storageKey, value), [key, 'local draft'])
  await page.reload()
  await expect(page.getByRole('button', { name: '下書きを復元' })).toBeVisible()
  await expect(memo).toHaveValue('')
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe('local draft')

  await page.getByRole('button', { name: '破棄' }).click()
  await expect(page.getByRole('button', { name: '下書きを復元' })).toBeHidden()
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull()

  await page.evaluate(([storageKey, value]) => localStorage.setItem(storageKey, value), [key, 'restored draft'])
  await page.reload()
  await page.getByRole('button', { name: '下書きを復元' }).click()
  await expect(memo).toHaveValue('restored draft')
  await expect(page.locator('#memo-save-status')).toHaveText('保存済み')
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull()

  await page.evaluate(([storageKey, value]) => localStorage.setItem(storageKey, value), [key, 'restored draft'])
  await page.reload()
  await expect(memo).toHaveValue('restored draft')
  await expect(page.getByRole('button', { name: '下書きを復元' })).toBeHidden()

  // A client navigation starts with no detail in the query cache.
  await page.evaluate(([storageKey, value]) => localStorage.setItem(storageKey, value), [key, 'pending draft'])
  await page.goto('/')
  await openNewNotebookDialog(page)
  await page.locator('dialog[open]').getByRole('button', { name: '閉じる' }).click()
  let releaseDetail!: () => void
  let detailRequested!: () => void
  const detailGate = new Promise<void>((resolve) => { releaseDetail = resolve })
  const detailSeen = new Promise<void>((resolve) => { detailRequested = resolve })
  await page.route('**/_serverFn/**', async (route) => {
    if (!isSourceDetailRequest(route.request().url())) return route.continue()
    detailRequested()
    await detailGate
    await route.continue()
  })
  const navigation = page.locator(`a[href="${notebookPath}"]`).click()
  await detailSeen
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe('pending draft')
  releaseDetail()
  await navigation
  await expect(page.getByRole('button', { name: '下書きを復元' })).toBeVisible()
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe('pending draft')

  await page.unroute('**/_serverFn/**')
  await page.goto('/')
  await openNewNotebookDialog(page)
  await page.locator('dialog[open]').getByRole('button', { name: '閉じる' }).click()
  let failDetail = true
  await page.route('**/_serverFn/**', async (route) => {
    if (!isSourceDetailRequest(route.request().url())) return route.continue()
    if (failDetail) return route.fulfill({ status: 503, body: 'temporary failure' })
    await route.continue()
  })
  await page.locator(`a[href="${notebookPath}"]`).click()
  const memoPanel = page.locator('[aria-labelledby="notebook-memo-heading"]')
  await expect(memoPanel.getByRole('button', { name: '再試行' })).toBeVisible({ timeout: 20_000 })
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe('pending draft')
  failDetail = false
  await memoPanel.getByRole('button', { name: '再試行' }).click()
  await expect(page.getByRole('button', { name: '下書きを復元' })).toBeVisible()
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBe('pending draft')
})
