import { expect, test, FIRST_SOURCE, SECOND_SOURCE, sourceButton } from './fixtures/notebook'

test('Back inside a notebook keeps a failed memo draft until discard', async ({ page, notebook }) => {
  await sourceButton(page, FIRST_SOURCE).click()
  await expect(page).toHaveURL(new RegExp(`sourceId=${notebook.firstSourceId}`))
  await sourceButton(page, SECOND_SOURCE).click()
  await expect(page).toHaveURL(new RegExp(`sourceId=${notebook.secondSourceId}`))

  await page.route('**/_serverFn/**', async (route) => {
    if (route.request().postData()?.includes('set-memo')) {
      return route.fulfill({ status: 503, body: 'temporary failure' })
    }
    await route.continue()
  })
  const memo = page.getByRole('textbox', { name: 'ソースのメモ' })
  await memo.fill('履歴移動前の未保存メモ')
  await expect(page.locator('#memo-save-status')).toHaveText('保存失敗')
  await page.evaluate(() => history.back())
  const guard = page.getByRole('alertdialog', { name: 'メモを保存できませんでした' })
  await expect(guard).toBeVisible()
  await expect(sourceButton(page, SECOND_SOURCE)).toHaveAttribute('aria-current', 'true')
  await expect(memo).toHaveValue('履歴移動前の未保存メモ')
  await guard.getByRole('button', { name: '破棄' }).click()
  await expect(sourceButton(page, FIRST_SOURCE)).toHaveAttribute('aria-current', 'true')
})
