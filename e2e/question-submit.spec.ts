import { expect, test, type Page, type Route } from '@playwright/test'

async function createPastedSource(page: Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const open = page.getByRole('button', { name: '新しいノート' })
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await open.click()
    await expect(dialog).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.locator('#source-add-paste-title').fill(`質問テスト ${crypto.randomUUID()}`)
  await dialog.locator('#source-add-paste-body').fill('質問テストの本文です。')
  await dialog.getByRole('button', { name: '本文を保存' }).click()
  const question = page.getByRole('textbox', { name: '質問' })
  await expect(question).toBeVisible()
  return question
}

async function interceptAsk(page: Page, question: string, handler: (route: Route) => Promise<void>) {
  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().method() === 'POST' && route.request().postData()?.includes(question)) {
      await handler(route)
    } else {
      await route.continue()
    }
  })
}

test('a competing job leaves the question draft and explains when to retry', async ({ page }) => {
  const input = await createPastedSource(page)
  const draft = '競合する質問'
  await interceptAsk(page, draft, async (route) => {
    const response = await route.fetch()
    expect(response.ok()).toBe(true)
    const payload = JSON.parse(await response.text())
    expect(payload.p.v[0].p.v[2]).toEqual({ t: 2, s: 2 })
    payload.p.v[0].p.v[2] = { t: 2, s: 3 }
    await route.fulfill({ response, body: JSON.stringify(payload) })
  })
  await input.fill(draft)
  await page.getByRole('button', { name: '質問する' }).click()
  await expect(input).toHaveValue(draft)
  await expect(page.getByText(/別の処理が実行中だったため、質問は送信されませんでした。処理が完了したら、もう一度/)).toBeVisible()
})

test('an accepted question clears the submitted draft', async ({ page }) => {
  const input = await createPastedSource(page)
  await input.fill('受理された質問')
  await page.getByRole('button', { name: '質問する' }).click()
  await expect(input).toHaveValue('')
})

test('editing while a question is pending keeps the newer draft', async ({ page }) => {
  const input = await createPastedSource(page)
  const draft = '最初の質問'
  let releaseResponse!: () => void
  const waitForRelease = new Promise<void>((resolve) => { releaseResponse = resolve })
  let requestSeen!: () => void
  const requestStarted = new Promise<void>((resolve) => { requestSeen = resolve })
  await interceptAsk(page, draft, async (route) => {
    requestSeen()
    await waitForRelease
    await route.fulfill({ response: await route.fetch() })
  })
  await input.fill(draft)
  const submit = page.getByRole('button', { name: '質問する' }).click()
  await requestStarted
  await input.fill(`${draft}への追記`)
  releaseResponse()
  await submit
  await expect(page.getByText(draft, { exact: true })).toBeVisible()
  await expect(input).toHaveValue(`${draft}への追記`)
})

test('a network failure keeps the question draft', async ({ page }) => {
  const input = await createPastedSource(page)
  const draft = '通信失敗の質問'
  await interceptAsk(page, draft, async (route) => route.abort('failed'))
  await input.fill(draft)
  await page.getByRole('button', { name: '質問する' }).click()
  await expect(input).toHaveValue(draft)
  await expect(page.locator('#investigate-action-error')).toBeVisible()
})
