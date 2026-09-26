import { expect, test, type Page } from '@playwright/test'

async function createNotebook(page: Page, title: string): Promise<string> {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await page.getByRole('button', { name: '新しいノート' }).click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル', { exact: true }).fill(title)
  await dialog.getByLabel('本文', { exact: true }).fill(`${title} の本文`)
  await dialog.getByRole('button', { name: '本文を保存' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('textbox', { name: 'ソースのメモ' })).toBeVisible()
  return page.url()
}

// TanStack History observes pushState, so this changes notebookId without a document reload.
async function switchNotebook(page: Page, url: string, title: string): Promise<void> {
  await page.evaluate((href) => {
    history.pushState({ __TSR_key: crypto.randomUUID() }, '', href)
  }, url)
  await expect(page).toHaveURL(url)
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'ソースのメモ' })).toBeVisible()
}

test('notebook changes reset title, search, source confirmation, and add dialog across Back/Forward', async ({ page }) => {
  test.setTimeout(120_000)
  const suffix = Date.now().toString(36)
  const aTitle = `Session A ${suffix}`
  const bTitle = `Session B ${suffix}`
  const aUrl = await createNotebook(page, aTitle)
  const bUrl = await createNotebook(page, bTitle)

  await switchNotebook(page, aUrl, aTitle)
  await page.getByRole('button', { name: '名前を変更' }).click()
  await page.getByRole('textbox', { name: 'ノート名' }).fill(`A draft ${suffix}`)
  await page.getByRole('searchbox', { name: '検索' }).fill('A search')
  await switchNotebook(page, bUrl, bTitle)
  await expect(page.getByRole('textbox', { name: 'ノート名' })).toHaveCount(0)
  await expect(page.getByRole('searchbox', { name: '検索' })).toHaveValue('')
  await expect(page.getByRole('heading', { name: bTitle, exact: true })).toBeVisible()

  await page.goBack()
  await expect(page).toHaveURL(aUrl)
  await expect(page.getByRole('textbox', { name: 'ノート名' })).toHaveCount(0)
  await expect(page.getByRole('searchbox', { name: '検索' })).toHaveValue('')
  await page.goForward()
  await expect(page).toHaveURL(bUrl)
  await expect(page.getByRole('heading', { name: bTitle, exact: true })).toBeVisible()

  await switchNotebook(page, aUrl, aTitle)
  await page.getByRole('button', { name: `${aTitle}の操作` }).click()
  await page.getByRole('menuitem', { name: '削除' }).click()
  await expect(page.getByRole('alertdialog', { name: `「${aTitle}」を削除します` })).toBeVisible()
  await switchNotebook(page, bUrl, bTitle)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: bTitle, exact: true })).toBeVisible()

  await switchNotebook(page, aUrl, aTitle)
  await page.getByRole('button', { name: 'ソースを追加' }).first().click()
  await expect(page.locator('dialog[open]')).toBeVisible()
  await switchNotebook(page, bUrl, bTitle)
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: bTitle, exact: true })).toBeVisible()
})

test('late rename response cannot close the next notebook editor', async ({ page }) => {
  test.setTimeout(120_000)
  const suffix = Date.now().toString(36)
  const aTitle = `Late A ${suffix}`
  const bTitle = `Late B ${suffix}`
  const aUrl = await createNotebook(page, aTitle)
  const bUrl = await createNotebook(page, bTitle)
  await switchNotebook(page, aUrl, aTitle)

  let release!: () => void
  let responseReady!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const seen = new Promise<void>((resolve) => { responseReady = resolve })
  await page.route('**/_serverFn/**', async (route) => {
    if (!route.request().postData()?.includes('rename-notebook')) return route.continue()
    const response = await route.fetch()
    responseReady()
    await gate
    await route.fulfill({ response })
  })

  await page.getByRole('button', { name: '名前を変更' }).click()
  await page.getByRole('textbox', { name: 'ノート名' }).fill(`Renamed A ${suffix}`)
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await seen
  await switchNotebook(page, bUrl, bTitle)
  await page.getByRole('button', { name: '名前を変更' }).click()
  const bInput = page.getByRole('textbox', { name: 'ノート名' })
  await bInput.fill(`B draft ${suffix}`)
  const responseReceived = page.waitForResponse((response) =>
    response.request().postData()?.includes('rename-notebook') ?? false,
  )
  release()
  await responseReceived
  await expect(bInput).toHaveValue(`B draft ${suffix}`)
  await expect(bInput).toBeVisible()
  await expect(page).toHaveURL(bUrl)
})

test('failed memo save blocks Back until the user discards the draft', async ({ page }) => {
  test.setTimeout(120_000)
  const suffix = Date.now().toString(36)
  const aTitle = `Guard A ${suffix}`
  const bTitle = `Guard B ${suffix}`
  const aUrl = await createNotebook(page, aTitle)
  const bUrl = await createNotebook(page, bTitle)
  await switchNotebook(page, aUrl, aTitle)
  await switchNotebook(page, bUrl, bTitle)

  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().postData()?.includes('set-memo')) {
      return route.fulfill({ status: 503, body: 'temporary failure' })
    }
    await route.continue()
  })
  const memo = page.getByRole('textbox', { name: 'ソースのメモ' })
  await memo.fill(`unsaved ${suffix}`)
  await expect(page.locator('#memo-save-status')).toHaveText('保存失敗')
  await page.evaluate(() => history.back())
  await expect(page.getByRole('alertdialog', { name: 'メモを保存できませんでした' })).toBeVisible()
  await expect(page.getByRole('heading', { name: bTitle, exact: true })).toBeVisible()
  await expect(memo).toHaveValue(`unsaved ${suffix}`)
  await page.getByRole('alertdialog', { name: 'メモを保存できませんでした' })
    .getByRole('button', { name: '破棄' }).click()
  await expect(page).toHaveURL(aUrl)
  await expect(page.getByRole('heading', { name: aTitle, exact: true })).toBeVisible()
})
