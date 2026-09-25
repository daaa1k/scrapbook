import { expect, test, type Page, type Route } from '@playwright/test'

async function addSource(page: Page, title: string, fromHome = false) {
  const dialog = page.locator('dialog[open]')
  const open = page.getByRole('button', { name: fromHome ? '新しいノート' : 'ソースを追加' }).first()
  await expect(async () => {
    await open.click()
    await expect(dialog).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 20_000 })
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル', { exact: true }).fill(title)
  await dialog.getByLabel('本文', { exact: true }).fill(`${title} の本文`)
  await dialog.getByRole('button', { name: '本文を保存' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(sourceButton(page, title)).toHaveAttribute('aria-current', 'true')
}

function sourceButton(page: Page, title: string) {
  return page.locator('#notebook-panel-sources button[title]').filter({ hasText: title })
}

async function selectSource(page: Page, title: string) {
  await sourceButton(page, title).click()
  await expect(sourceButton(page, title)).toHaveAttribute('aria-current', 'true')
}

test('source drafts survive source switches and history, remain isolated, and can be discarded', async ({ page }) => {
  test.setTimeout(120_000)
  const a = `Draft A ${Date.now()}`
  const b = `Draft B ${Date.now()}`
  await page.goto('/')
  await addSource(page, a, true)
  const aUrl = page.url()
  await addSource(page, b)
  await selectSource(page, a)

  const question = page.getByRole('textbox', { name: '質問' })
  const paste = page.getByRole('form', { name: '本文の貼り付け' })
  await question.fill('A の未送信質問')
  await page.getByRole('button', { name: '本文を貼り付ける' }).click()
  await paste.getByLabel('タイトル').fill('A の貼付タイトル')
  await paste.getByLabel('本文').fill('A の未送信本文')
  await selectSource(page, b)
  await expect(question).toHaveValue('')
  await page.getByRole('button', { name: '本文を貼り付ける' }).click()
  await expect(paste.getByLabel('本文')).toHaveValue('')
  await question.fill('B の質問')
  await page.goBack()
  await expect(page).toHaveURL(aUrl)
  await expect(question).toHaveValue('A の未送信質問')
  await expect(paste.getByLabel('タイトル')).toHaveValue('A の貼付タイトル')
  await expect(paste.getByLabel('本文')).toHaveValue('A の未送信本文')
  await page.goForward()
  await expect(question).toHaveValue('B の質問')
  await selectSource(page, a)
  await page.getByRole('button', { name: '質問下書きを破棄' }).click()
  await paste.getByRole('button', { name: '貼付下書きを破棄' }).click()
  await selectSource(page, b)
  await selectSource(page, a)
  await expect(question).toHaveValue('')
  await page.getByRole('button', { name: '本文を貼り付ける' }).click()
  await expect(paste.getByLabel('本文')).toHaveValue('')
})

test('mobile tabs keep source drafts and deletion removes the deleted source', async ({ page }) => {
  test.setTimeout(120_000)
  const a = `Mobile A ${Date.now()}`
  const b = `Mobile B ${Date.now()}`
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await addSource(page, a, true)
  await page.getByRole('tab', { name: 'ソース', exact: true }).click()
  await addSource(page, b)
  await page.getByRole('tab', { name: 'ソース', exact: true }).click()
  await selectSource(page, a)
  const question = page.getByRole('textbox', { name: '質問' })
  await question.fill('モバイルの質問')
  await page.getByRole('tab', { name: 'ソース', exact: true }).click()
  await selectSource(page, b)
  await expect(question).toHaveValue('')
  await page.getByRole('tab', { name: 'ソース', exact: true }).click()
  await selectSource(page, a)
  await expect(question).toHaveValue('モバイルの質問')
  await page.getByRole('tab', { name: 'ソース', exact: true }).click()
  await page.getByRole('button', { name: `${a}の操作` }).click()
  await page.getByRole('menuitem', { name: '削除' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '削除' }).click()
  await expect(sourceButton(page, a)).toHaveCount(0)
  await expect(question).toHaveValue('')
})

test('accepted question clears its snapshot while a later edit survives source switching', async ({ page }) => {
  test.setTimeout(120_000)
  const a = `Pending A ${Date.now()}`
  const b = `Pending B ${Date.now()}`
  await page.goto('/')
  await addSource(page, a, true)
  await addSource(page, b)
  await selectSource(page, a)
  const question = page.getByRole('textbox', { name: '質問' })
  const submitted = '受理する質問'
  let release!: () => void
  let seen!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const started = new Promise<void>((resolve) => { seen = resolve })
  await page.route('**/_serverFn/**', async (route: Route) => {
    if (route.request().method() !== 'POST' || !route.request().postData()?.includes(submitted)) return route.continue()
    seen()
    await gate
    await route.fulfill({ response: await route.fetch() })
  })
  await question.fill(submitted)
  const send = page.getByRole('button', { name: '質問する' }).click()
  await started
  await question.fill(`${submitted} の追記`)
  release()
  await send
  await expect(page.getByText(submitted, { exact: true })).toBeVisible()
  await selectSource(page, b)
  await selectSource(page, a)
  await expect(question).toHaveValue(`${submitted} の追記`)
})
