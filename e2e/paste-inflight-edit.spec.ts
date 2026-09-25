import { expect, test, type Page } from '@playwright/test'

const PDF = `%PDF-1.4
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 51 >>stream
BT /F1 12 Tf 20 100 Td (scrapbook-hello) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000374 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
445
%%EOF`

async function createScannedPdf(page: Page) {
  await page.goto('/')
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await page.getByRole('button', { name: '新しいノート' }).click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await dialog.getByRole('tab', { name: 'PDF' }).click()
  const blankPdf = PDF.replace('scrapbook-hello', ' '.repeat('scrapbook-hello'.length))
  await dialog.getByLabel('PDFファイル').setInputFiles({
    name: `scanned-${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from(blankPdf),
  })
  await dialog.getByRole('button', { name: 'PDFを登録' }).click()
  await expect(page.getByRole('form', { name: '本文の貼り付け' })).toBeVisible()
}

test('keeps unsent title and body edits made while pasted body is saving', async ({ page }) => {
  test.setTimeout(120_000)
  await createScannedPdf(page)
  const form = page.getByRole('form', { name: '本文の貼り付け' })
  const title = form.getByLabel('タイトル')
  const body = form.getByLabel('本文')
  const save = form.getByRole('button', { name: '本文を貼り付ける' })

  const cases = [
    { submitted: '本文A', nextBody: '本文AB', changeTitle: false },
    { submitted: '本文AB', nextBody: '本文AB', changeTitle: true },
    { submitted: '本文AB', nextBody: '本文ABC', changeTitle: true },
  ]
  for (const [index, scenario] of cases.entries()) {
    await body.fill(scenario.submitted)
    await expect(save).toBeEnabled()
    let requestStarted!: () => void
    let releaseResponse!: () => void
    const seen = new Promise<void>((resolve) => { requestStarted = resolve })
    const gate = new Promise<void>((resolve) => { releaseResponse = resolve })
    await page.route('**/_serverFn/**', async (route) => {
      if (!route.request().postData()?.includes(scenario.submitted)) return route.continue()
      const response = await route.fetch()
      requestStarted()
      await gate
      await route.fulfill({ response })
    })
    await save.click()
    await seen
    const nextTitle = `${await title.inputValue()} edit ${index}`
    if (scenario.changeTitle) await title.fill(nextTitle)
    if (scenario.nextBody !== scenario.submitted) await body.fill(scenario.nextBody)
    releaseResponse()
    await expect(form).toBeVisible()
    await expect(form.getByRole('status')).toContainText('まだ保存されていません')
    await expect(body).toHaveValue(scenario.nextBody)
    if (scenario.changeTitle) await expect(title).toHaveValue(nextTitle)
    await page.unrouteAll({ behavior: 'wait' })
    await expect(save).toBeEnabled()
  }

  await save.click()
  await expect(form).toBeHidden()
})
