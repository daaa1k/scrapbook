import { expect, test, FIRST_SOURCE, SECOND_SOURCE, sourceButton } from './fixtures/notebook'

test('home resumes an explicitly selected source and ignores stale storage or explicit URLs', async ({ page, notebook }) => {
  await sourceButton(page, FIRST_SOURCE).click()
  await expect(page).toHaveURL(new RegExp(`sourceId=${notebook.firstSourceId}`))
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.locator(`a[href^="${notebook.path}"]`).first().click()
  await expect(page).toHaveURL(new RegExp(`sourceId=${notebook.firstSourceId}`))
  await expect(sourceButton(page, FIRST_SOURCE)).toHaveAttribute('aria-current', 'true')

  await page.goto(`${notebook.path}?sourceId=${notebook.secondSourceId}`)
  await expect(sourceButton(page, SECOND_SOURCE)).toHaveAttribute('aria-current', 'true')
  await page.evaluate((id) => localStorage.setItem(`scrapbook-last-source:${id}`, 'deleted-source'),
    notebook.path.split('/').at(-1)!)
  await page.goto(notebook.path)
  await expect(sourceButton(page, SECOND_SOURCE)).toHaveAttribute('aria-current', 'true')
})

test('a notebook still opens when localStorage is unavailable', async ({ page, notebook }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage denied') } })
  })
  await page.goto(notebook.path)
  await expect(sourceButton(page, SECOND_SOURCE)).toHaveAttribute('aria-current', 'true')
})
