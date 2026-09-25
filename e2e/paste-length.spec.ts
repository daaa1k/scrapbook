import { expect, test, type Page } from '@playwright/test'

async function pasteText(page: Page, text: string) {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text)
  await page.keyboard.press('ControlOrMeta+V')
}

test('keeps oversized native pastes visible and saves a body at the limit', async ({ page, context }) => {
  test.setTimeout(120_000)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await page.getByRole('button', { name: '新しいノート' }).click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル').fill(`貼り付け上限 ${Date.now()}`)

  const body = dialog.getByLabel('本文', { exact: true })
  const save = dialog.getByRole('button', { name: '本文を保存' })
  const overLimit = 'あ'.repeat(200_000) + '末'
  const exactLimit = 'あ'.repeat(199_999) + '終'

  await body.fill('先')
  await body.focus()
  await body.press('End')
  await pasteText(page, overLimit.slice(0, 200_000))
  await expect(body).toHaveValue('先' + overLimit.slice(0, 200_000))
  await expect(dialog.locator('#source-add-paste-count')).toHaveText('200,001 / 200,000')
  await expect(dialog.getByText('本文は200,000文字以内にしてください。超過分を削除してから送信してください。')).toBeVisible()
  await expect(save).toBeDisabled()

  await body.press('ControlOrMeta+A')
  await pasteText(page, overLimit)
  await expect(body).toHaveValue(overLimit)
  await expect(save).toBeDisabled()

  await body.press('ControlOrMeta+A')
  await pasteText(page, exactLimit)
  await expect(body).toHaveValue(exactLimit)
  await expect(dialog.locator('#source-add-paste-count')).toHaveText('200,000 / 200,000')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(dialog).not.toBeVisible({ timeout: 30_000 })
})
