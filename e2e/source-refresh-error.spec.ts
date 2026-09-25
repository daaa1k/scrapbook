import { expect, test, FIRST_SOURCE, sourceButton } from './fixtures/notebook'

function isSourceDetailRequest(url: string): boolean {
  const encoded = new URL(url).pathname.split('/_serverFn/')[1]
  return encoded ? Buffer.from(encoded, 'base64url').toString('utf8').includes('getSource_createServerFn_handler') : false
}

test('keeps loaded content and a question draft through a failed background refresh', async ({ page, notebook }) => {
  test.setTimeout(90_000)
  await sourceButton(page, FIRST_SOURCE).click()
  await expect(page).toHaveURL(new RegExp(`sourceId=${notebook.firstSourceId}`))
  const question = page.getByRole('textbox', { name: '質問' })
  await question.fill('進捗確認の質問')
  await page.getByRole('button', { name: '質問する' }).click()
  await expect(question).toHaveValue('')
  await question.fill('まだ送らない質問')
  await page.route('**/_serverFn/**', async (route) => {
    if (isSourceDetailRequest(route.request().url())) {
      return route.fulfill({ status: 503, body: 'temporary failure' })
    }
    await route.continue()
  })

  const warning = page.getByRole('status').filter({ hasText: '最新の状態を取得できませんでした' })
  await expect(warning).toBeVisible({ timeout: 30_000 })
  await expect(question).toHaveValue('まだ送らない質問')
  await expect(page.getByText(FIRST_SOURCE, { exact: true }).first()).toBeVisible()
  await page.unrouteAll({ behavior: 'wait' })
  await warning.getByRole('button', { name: '表示を更新' }).click()
  await expect(warning).toHaveCount(0)
  await expect(question).toHaveValue('まだ送らない質問')
})
