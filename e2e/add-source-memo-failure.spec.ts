import { expect, test, FIRST_SOURCE, sourceButton } from './fixtures/notebook'
import { SAMPLE_PDF } from './fixtures/sample-pdf'

for (const method of ['paste', 'url', 'pdf'] as const) {
  test(`registered ${method} source survives a failed memo handoff without another registration`, async ({ page, notebook }) => {
    test.setTimeout(90_000)
    await sourceButton(page, FIRST_SOURCE).click()
    await expect(page).toHaveURL(new RegExp(`sourceId=${notebook.firstSourceId}`))
    let failMemo = true
    await page.route('**/_serverFn/**', async (route) => {
      if (failMemo && route.request().postData()?.includes('set-memo')) {
        return route.fulfill({ status: 503, body: 'temporary failure' })
      }
      await route.continue()
    })
    const memo = page.getByRole('textbox', { name: 'ソースのメモ' })
    await memo.fill(`未保存の ${method} メモ`)
    await expect(page.locator('#memo-save-status')).toHaveText('保存失敗')
    const sourceRows = page.locator('#notebook-panel-sources li')
    const before = await sourceRows.count()
    await page.getByRole('button', { name: 'ソースを追加' }).first().click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog).toBeVisible()
    if (method === 'paste') {
      await dialog.getByRole('tab', { name: '貼り付け' }).click()
      await dialog.getByLabel('タイトル', { exact: true }).fill('回復用の貼付ソース')
      await dialog.getByLabel('本文', { exact: true }).fill('回復用の本文')
      await dialog.getByRole('button', { name: '本文を保存' }).click()
    } else if (method === 'url') {
      await dialog.getByLabel('ページのURL').fill(`https://example.com/recovery-${Date.now()}`)
      await dialog.getByRole('button', { name: 'URLを登録' }).click()
    } else {
      await dialog.getByRole('tab', { name: 'PDF' }).click()
      await dialog.getByLabel('PDFファイル').setInputFiles({
        name: 'recovery.pdf', mimeType: 'application/pdf', buffer: Buffer.from(SAMPLE_PDF),
      })
      await dialog.getByRole('button', { name: 'PDFを登録' }).click()
    }
    await expect(dialog.getByText('ソースは追加済みです。')).toBeVisible({ timeout: 45_000 })
    await expect(dialog.getByText('メモを保存できなかったため、まだ新しいソースへ移動していません。')).toBeVisible()
    await expect(sourceRows).toHaveCount(before + 1)
    await expect(memo).toHaveValue(`未保存の ${method} メモ`)
    failMemo = false
    await dialog.getByRole('button', { name: 'メモ保存を再試行して移動' }).click()
    await expect(dialog).toBeHidden()
    await expect(sourceRows).toHaveCount(before + 1)
    await sourceButton(page, FIRST_SOURCE).click()
    await expect(memo).toHaveValue(`未保存の ${method} メモ`)
  })
}
