import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:3000'
const port = new URL(baseURL).port || '3000'

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    },
  },
  webServer: {
    command: `bun run migrate && bun run dev -- --port ${port} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
