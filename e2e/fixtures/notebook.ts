import { expect, test as base, type Page } from '@playwright/test'

export const SOURCE_BODY = '図書館の開館時間は午前九時から午後五時までです。毎週月曜日は休館します。'
export const FIRST_SOURCE = '図書館の案内'
export const SECOND_SOURCE = '貸出の案内'

export function sourceButton(page: Page, title: string) {
  return page.locator('#notebook-panel-sources button[title]').filter({ hasText: title })
}

export async function addPastedSource(page: Page, title: string, body: string, fromHome = false) {
  const open = page.getByRole('button', { name: fromHome ? '新しいノート' : 'ソースを追加' }).first()
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await open.click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル', { exact: true }).fill(title)
  await dialog.getByLabel('本文', { exact: true }).fill(body)
  await dialog.getByRole('button', { name: '本文を保存' }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/\/notebooks\/[^/]+\?sourceId=/)
  await expect(page.getByRole('textbox', { name: '質問' })).toBeVisible()
}

type NotebookFixture = {
  notebook: { path: string; firstSourceId: string; secondSourceId: string }
}

export const test = base.extend<NotebookFixture>({
  notebook: async ({ page }, use) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await addPastedSource(page, FIRST_SOURCE, SOURCE_BODY, true)
    const path = new URL(page.url()).pathname
    const firstSourceId = new URL(page.url()).searchParams.get('sourceId')!
    await addPastedSource(page, SECOND_SOURCE, '貸出期間は二週間です。')
    const secondSourceId = new URL(page.url()).searchParams.get('sourceId')!
    await use({ path, firstSourceId, secondSourceId })
  },
})

export { expect }
