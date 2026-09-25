import { expect, test, type Page } from '@playwright/test'
import { SAMPLE_PDF } from './fixtures/sample-pdf'

async function openAdd(page: Page, newNotebook: boolean) {
  const button = page.getByRole('button', { name: newNotebook ? '新しいノート' : 'ソースを追加' }).first()
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await button.click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  return dialog
}

function sourceDates(page: Page) {
  return page.getByRole('tabpanel', { name: '要約・質問' }).locator('dl')
}

test('pasted body time stays fixed after memo editing and summarization', async ({ page }) => {
  await page.goto('/')
  const dialog = await openAdd(page, true)
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル', { exact: true }).fill(`日付テスト ${Date.now()}`)
  await dialog.getByLabel('本文', { exact: true }).fill('保存した本文です。')
  await dialog.getByRole('button', { name: '本文を保存' }).click()

  const dates = sourceDates(page)
  await expect(dates.locator('dt').first()).toHaveText('公開日')
  await expect(dates.locator('dd').first()).toHaveText('不明')
  await expect(dates.locator('dt').nth(1)).toHaveText('本文の貼付日時')
  const bodyTime = dates.locator('dd').nth(1).locator('time')
  await expect(bodyTime).toContainText('JST')
  await expect(bodyTime).toHaveAttribute('datetime', /Z$/)
  const original = await bodyTime.getAttribute('datetime')

  await page.getByRole('textbox', { name: 'ソースのメモ' }).fill('後から書いたメモ')
  await expect(page.locator('#memo-save-status')).toHaveText('保存済み')
  await expect(bodyTime).toHaveAttribute('datetime', original!)
  await page.getByRole('button', { name: '要約する', exact: true }).click()
  await expect(bodyTime).toHaveAttribute('datetime', original!)
  await page.reload()
  await expect(sourceDates(page).locator('dd').nth(1).locator('time')).toHaveAttribute('datetime', original!)
})

test('URL starts with unknown dates and PDF shows its extraction time', async ({ page }) => {
  await page.goto('/')
  const dialog = await openAdd(page, true)
  await dialog.getByLabel('ページのURL').fill(`https://example.com/source-dates-${Date.now()}`)
  await dialog.getByRole('button', { name: 'URLを登録' }).click()
  const dates = sourceDates(page)
  await expect(dates.locator('dd').first()).toHaveText('不明')
  await expect(dates.locator('dt').nth(1)).toHaveText('本文の取得日時')
  await expect(dates.locator('dd').nth(1)).toHaveText('不明')

  const pdfDialog = await openAdd(page, false)
  await pdfDialog.getByRole('tab', { name: 'PDF' }).click()
  await pdfDialog.getByLabel('PDFファイル').setInputFiles({
    name: 'source-dates.pdf', mimeType: 'application/pdf', buffer: Buffer.from(SAMPLE_PDF),
  })
  await pdfDialog.getByRole('button', { name: 'PDFを登録' }).click()
  await expect(sourceDates(page).locator('dt').nth(1)).toHaveText('本文の抽出日時')
  await expect(sourceDates(page).locator('dd').first()).toHaveText('不明')
  await expect(sourceDates(page).locator('dd').nth(1).locator('time')).toHaveAttribute('datetime', /Z$/)
})
