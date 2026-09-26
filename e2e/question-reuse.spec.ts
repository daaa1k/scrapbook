import { expect, test, FIRST_SOURCE, sourceButton } from './fixtures/notebook'

test('reuses a past question after confirming replacement of an unsent draft', async ({ page, notebook }) => {
  await expect.poll(() => sourceButton(page, FIRST_SOURCE).evaluate((element) =>
    Object.keys(element).some((key) => key.startsWith('__reactFiber$')),
  )).toBe(true)
  await sourceButton(page, FIRST_SOURCE).click()
  await expect(page).toHaveURL(new RegExp(`sourceId=${notebook.firstSourceId}`))
  const question = page.getByRole('textbox', { name: '質問' })
  const original = '開館時間は？'
  await question.fill(original)
  await page.getByRole('button', { name: '質問する' }).click()
  await expect(question).toHaveValue('')
  const turn = page.locator('[id^="qa-turn-"]').filter({ hasText: original })
  await expect(turn).toBeVisible()

  await question.fill('未送信の下書き')
  await turn.getByRole('button', { name: '編集して質問' }).click()
  const confirm = page.getByRole('alertdialog', { name: '質問下書きを置き換えますか？' })
  await confirm.getByRole('button', { name: 'キャンセル' }).click()
  await expect(question).toHaveValue('未送信の下書き')
  await turn.getByRole('button', { name: '編集して質問' }).click()
  await confirm.getByRole('button', { name: '置き換える' }).click()
  await expect(question).toHaveValue(original)
  await expect(question).toBeFocused()
  await expect(turn).toBeVisible()

  await question.fill(`${original} 土曜日は？`)
  await expect(question).toHaveValue(`${original} 土曜日は？`)
  await expect(page.locator('[id^="qa-turn-"]')).toHaveCount(1)
  await expect(turn).toBeVisible()
})
