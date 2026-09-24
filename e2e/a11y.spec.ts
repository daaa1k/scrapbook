import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator } from '@playwright/test'

async function assertNoCriticalOrSerious(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze()
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  )
  expect(blocking, `${label}: critical/serious axe violations`).toEqual([])
}

async function expectTextContrastAtLeast(locator: Locator, minimum = 4.5) {
  const contrast = await locator.evaluate((element) => {
    function rgb(value: string): number[] {
      const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number)
      if (!channels || channels.length !== 3) throw new Error(`Unsupported color: ${value}`)
      return channels
    }
    function luminance(channels: number[]): number {
      const [red, green, blue] = channels.map((channel) => {
        const normalized = channel / 255
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return red * 0.2126 + green * 0.7152 + blue * 0.0722
    }
    let background: Element | null = element
    while (background) {
      const color = getComputedStyle(background).backgroundColor
      if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        const foregroundLight = luminance(rgb(getComputedStyle(element).color))
        const backgroundLight = luminance(rgb(color))
        return (Math.max(foregroundLight, backgroundLight) + 0.05) /
          (Math.min(foregroundLight, backgroundLight) + 0.05)
      }
      background = background.parentElement
    }
    throw new Error('No opaque background found')
  })
  expect(contrast).toBeGreaterThanOrEqual(minimum)
}

test.describe('axe critical/serious = 0', () => {
  test('home light', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await assertNoCriticalOrSerious(page, 'home-light')
  })

  test('home dark', async ({ page }) => {
    await page.goto('/')
    const theme = page.getByRole('button', { name: /Theme:/ })
    await theme.click()
    await theme.click()
    await expect(page.getByRole('heading', { level: 1, name: 'ノート' })).toBeVisible()
    await assertNoCriticalOrSerious(page, 'home-dark')
  })

  test('create notebook dialog', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: '新しいノート' }).click()
    const dialog = page.locator('dialog[open]')
    await expect(dialog.getByRole('heading', { name: '新しいノート' })).toBeVisible({ timeout: 15_000 })
    await expect(dialog.getByRole('tablist', { name: '入力方法' })).toBeVisible()
    await assertNoCriticalOrSerious(page, 'source-add-dialog')
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`populated study workspace ${theme}`, async ({ page }) => {
      await page.addInitScript((preference) => {
        localStorage.setItem('scrapbook-theme', preference)
      }, theme)
      await page.goto('/')
      const dialog = page.locator('dialog[open]')
      await expect(async () => {
        await page.getByRole('button', { name: '新しいノート' }).click()
        await expect(dialog).toBeVisible({ timeout: 1_000 })
      }).toPass({ timeout: 20_000 })
      await dialog.getByRole('tab', { name: '貼り付け' }).click()
      await dialog.getByLabel('タイトル').fill(`a11y study ${theme} ${Date.now()}`)
      await dialog.getByLabel('本文', { exact: true }).fill('要約と質問の画面を確認するための本文です。')
      await dialog.getByRole('button', { name: '本文を保存' }).click()

      const study = page.getByRole('tabpanel', { name: '要約・質問' })
      const memo = page.getByRole('tabpanel', { name: 'メモ' })
      await expect(study.getByText('まだ質問はありません')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expectTextContrastAtLeast(study.getByText('まだ質問はありません'))
      await expectTextContrastAtLeast(study.getByRole('heading', { name: '要約', exact: true }))
      await expectTextContrastAtLeast(memo.getByRole('heading', { name: 'メモ' }))
      await assertNoCriticalOrSerious(page, `populated-study-${theme}`)
    })
  }
})
