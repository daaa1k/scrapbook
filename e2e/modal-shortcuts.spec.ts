import { expect, test, type Locator, type Page } from '@playwright/test'

async function addPasteSource(page: Page, title: string, first = false) {
  const open = page.getByRole('button', { name: first ? '新しいノート' : 'ソースを追加' }).first()
  const dialog = page.locator('dialog[open]')
  await expect(async () => {
    await open.click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await dialog.getByRole('tab', { name: '貼り付け' }).click()
  await dialog.getByLabel('タイトル', { exact: true }).fill(title)
  await dialog.getByLabel('本文', { exact: true }).fill(`${title} の本文です。`)
  await dialog.getByRole('button', { name: '本文を保存' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('#notebook-panel-sources button[aria-current="true"]')).toContainText(title)
}

async function expectKeysStayOnSource(page: Page, button: Locator, url: string, title: string, memo: string) {
  const selected = page.locator('#notebook-panel-sources button[aria-current="true"]')
  for (const key of ['j', 'k', '[', ']']) {
    await button.focus()
    await expect(button).toBeFocused()
    await button.press(key)
    await expect(page).toHaveURL(url)
    await expect(selected).toContainText(title)
    await expect(page.getByRole('textbox', { name: 'ソースのメモ' })).toHaveValue(memo)
  }
}

test('modal shortcuts leave the source and memo alone, then work after closing', async ({ page }) => {
  test.setTimeout(120_000)
  const first = `Shortcut first ${Date.now()}`
  const second = `Shortcut second ${Date.now()}`
  const memoDraft = 'ダイアログ中も維持するメモ'
  await page.goto('/')
  await addPasteSource(page, first, true)
  await addPasteSource(page, second)
  const memo = page.getByRole('textbox', { name: 'ソースのメモ' })
  await memo.fill(memoDraft)
  const selectedUrl = page.url()

  await page.getByRole('button', { name: 'ショートカット' }).click()
  const help = page.getByRole('dialog', { name: 'キーボードショートカット' })
  await expect(help).toBeVisible()
  await expectKeysStayOnSource(page, help.getByRole('button', { name: '閉じる' }), selectedUrl, second, memoDraft)
  await help.getByRole('button', { name: '閉じる' }).click()

  await page.getByRole('button', { name: 'ソースを追加' }).first().click()
  const add = page.getByRole('dialog', { name: 'ソースを追加' })
  await expect(add).toBeVisible()
  await expectKeysStayOnSource(page, add.getByRole('button', { name: '閉じる' }), selectedUrl, second, memoDraft)
  await add.getByRole('tab', { name: '貼り付け' }).click()
  await add.getByLabel('タイトル', { exact: true }).fill('破棄する下書き')
  await add.getByRole('button', { name: '閉じる' }).click()
  const discard = page.getByRole('alertdialog')
  await expect(discard).toBeVisible()
  await expectKeysStayOnSource(page, discard.getByRole('button', { name: 'キャンセル' }), selectedUrl, second, memoDraft)
  await discard.getByRole('button', { name: 'キャンセル' }).click()
  await expect(add).toBeVisible()
  await add.getByRole('button', { name: '閉じる' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '破棄' }).click()
  await expect(add).not.toBeVisible()

  await page.getByRole('button', { name: `${second}の操作` }).click()
  await page.getByRole('menuitem', { name: '削除' }).click()
  const deleteConfirm = page.getByRole('alertdialog')
  await expect(deleteConfirm).toBeVisible()
  await expectKeysStayOnSource(page, deleteConfirm.getByRole('button', { name: 'キャンセル' }), selectedUrl, second, memoDraft)
  await deleteConfirm.getByRole('button', { name: 'キャンセル' }).click()

  await page.getByRole('button', { name: '名前を変更' }).focus()
  await page.keyboard.press('j')
  await expect(page.locator('#notebook-panel-sources button[aria-current="true"]')).toContainText(first)
  await expect(page).not.toHaveURL(selectedUrl)
})
