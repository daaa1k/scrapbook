import { expect, test, type Locator, type Page } from '@playwright/test'

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

async function retrySelectedPdf(page: Page) {
  const dialog = page.locator('dialog[open]')
  await expect(dialog.getByRole('tablist', { name: '入力方法' })).toBeVisible()
  await dialog.getByRole('tab', { name: 'PDF' }).click()
  const fileInput = dialog.getByLabel('PDFファイル')
  const submit = dialog.getByRole('button', { name: 'PDFを登録' })
  await fileInput.setInputFiles({ name: 'retry.pdf', mimeType: 'application/pdf', buffer: Buffer.from(PDF) })

  let uploads = 0
  await page.route('**/*', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST' || !request.postData()?.includes('retry.pdf')) {
      await route.continue()
      return
    }
    uploads += 1
    if (uploads === 1) {
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'temporary upload failure' })
      return
    }
    await route.continue()
  })

  await submit.click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByText('retry.pdf', { exact: false })).toBeVisible()
  expect(await fileInput.evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe('retry.pdf')
  await expect(submit).toBeEnabled()

  await submit.click()
  await expect(dialog).not.toBeVisible({ timeout: 45_000 })
  expect(uploads).toBe(2)
  await page.unrouteAll({ behavior: 'wait' })
}

async function clickHydrated(button: Locator) {
  await expect
    .poll(() => button.evaluate((element) => Object.keys(element).some((key) => key.startsWith('__reactFiber$'))))
    .toBe(true)
  await button.click()
}

test('retries the same selected PDF in a new and an existing notebook', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await clickHydrated(page.getByRole('button', { name: '新しいノート' }))
  await retrySelectedPdf(page)
  await expect(page).toHaveURL(/\/notebooks\/[^/]+/)
  await page.reload()

  await clickHydrated(page.getByRole('button', { name: 'ソースを追加' }).first())
  await retrySelectedPdf(page)
})
