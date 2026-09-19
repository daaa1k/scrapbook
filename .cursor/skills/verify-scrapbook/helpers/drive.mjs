#!/usr/bin/env bun
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

const baseUrl = process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:3000'
const evidenceRoot =
  process.env.VERIFY_EVIDENCE_DIR ??
  `/cursor/stores/bc-7849fa82-1973-46ca-a837-b0e386645567/media/verify-scrapbook/${process.env.VERIFY_RUN_ID ?? 'default'}`
const runId = process.env.VERIFY_RUN_ID ?? 'default'

function usage() {
  console.error(`usage:
  drive.mjs paste-source --title <title> --body <body> [--out <dir>]
  drive.mjs url-source --url <url> [--out <dir>]
  drive.mjs pdf-source --file <path> [--out <dir>]
  drive.mjs screenshot --path <file> [--url <path>]
  drive.mjs snapshot --path <file> [--url <path>]`)
  process.exit(2)
}

function argValue(argv, name) {
  const i = argv.indexOf(name)
  if (i === -1 || i === argv.length - 1) return null
  return argv[i + 1]
}

function hasFlag(argv, name) {
  return argv.includes(name)
}

async function withPage(fn) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    return await fn(page)
  } finally {
    await browser.close()
  }
}

async function writeMeta(dir, extra) {
  await mkdir(dir, { recursive: true })
  const meta = {
    featureId: extra.featureId,
    entryPoint: extra.entryPoint,
    baseUrl,
    runId,
    at: new Date().toISOString(),
    ...extra,
  }
  await writeFile(resolve(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
}

async function openCreateDialog(page) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '新しいノート' }).first().click()
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '新しいノート' }) })
  await dialog.getByRole('heading', { name: '新しいノート' }).waitFor()
  await dialog.getByRole('tablist', { name: '入力方法' }).waitFor()
  return dialog
}

async function pasteSource(argv) {
  const title = argValue(argv, '--title')
  const body = argValue(argv, '--body')
  if (!title || !body) usage()
  const out = resolve(argValue(argv, '--out') ?? resolve(evidenceRoot, 'paste-source'))
  await mkdir(out, { recursive: true })

  await withPage(async (page) => {
    const dialog = await openCreateDialog(page)
    await page.screenshot({ path: resolve(out, 'before.png'), fullPage: true })

    await dialog.getByRole('tab', { name: '貼り付け' }).click()
    await dialog.getByRole('textbox', { name: 'タイトル' }).fill(title)
    await dialog.getByRole('textbox', { name: '本文' }).fill(body)
    await dialog.getByRole('button', { name: '本文を保存' }).click()
    await page.waitForURL(/\/notebooks\/[^/]+/, { timeout: 30_000 })
    await page.getByText(title, { exact: true }).first().waitFor({ timeout: 30_000 })

    await page.screenshot({ path: resolve(out, 'after.png'), fullPage: true })
    const aria = await page.locator('body').ariaSnapshot()
    await writeFile(resolve(out, 'aria.txt'), `${aria}\n`)
    await writeMeta(out, {
      featureId: 'paste-source',
      entryPoint: '/#new-notebook-paste',
      resultUrl: page.url(),
      title,
    })
    console.log(`paste-source: ok url=${page.url()} evidence=${out}`)
  })
}

async function urlSource(argv) {
  const url = argValue(argv, '--url')
  if (!url) usage()
  const out = resolve(argValue(argv, '--out') ?? resolve(evidenceRoot, 'register-url'))
  await mkdir(out, { recursive: true })

  await withPage(async (page) => {
    const dialog = await openCreateDialog(page)
    await page.screenshot({ path: resolve(out, 'before.png'), fullPage: true })
    await dialog.getByRole('textbox', { name: 'ページのURL' }).fill(url)
    await dialog.getByRole('button', { name: 'URLを登録' }).click()
    await page.waitForURL(/\/notebooks\/[^/]+/, { timeout: 30_000 })
    await page.screenshot({ path: resolve(out, 'after.png'), fullPage: true })
    const aria = await page.locator('body').ariaSnapshot()
    await writeFile(resolve(out, 'aria.txt'), `${aria}\n`)
    await writeMeta(out, {
      featureId: 'register-url',
      entryPoint: '/#new-notebook-url',
      resultUrl: page.url(),
      submittedUrl: url,
    })
    console.log(`url-source: ok url=${page.url()} evidence=${out}`)
  })
}

async function pdfSource(argv) {
  const file = argValue(argv, '--file')
  if (!file) usage()
  const pdfPath = resolve(file)
  const out = resolve(argValue(argv, '--out') ?? resolve(evidenceRoot, 'pdf-source'))
  await mkdir(out, { recursive: true })

  await withPage(async (page) => {
    const dialog = await openCreateDialog(page)
    await dialog.getByRole('tab', { name: 'PDF' }).click()
    await dialog.getByLabel('PDFファイル').setInputFiles(pdfPath)
    await page.screenshot({ path: resolve(out, 'before.png'), fullPage: true })
    await dialog.getByRole('button', { name: 'PDFを登録' }).click()
    await page.waitForURL(/\/notebooks\/[^/]+/, { timeout: 30_000 })
    await page.screenshot({ path: resolve(out, 'after.png'), fullPage: true })
    const aria = await page.locator('body').ariaSnapshot()
    await writeFile(resolve(out, 'aria.txt'), `${aria}\n`)
    await writeMeta(out, {
      featureId: 'pdf-source',
      entryPoint: '/#new-notebook-pdf',
      resultUrl: page.url(),
      file: pdfPath,
    })
    console.log(`pdf-source: ok url=${page.url()} evidence=${out}`)
  })
}

async function screenshot(argv) {
  const path = argValue(argv, '--path')
  if (!path) usage()
  const urlPath = argValue(argv, '--url') ?? '/'
  await mkdir(dirname(resolve(path)), { recursive: true })
  await withPage(async (page) => {
    await page.goto(`${baseUrl}${urlPath}`, { waitUntil: 'networkidle' })
    await page.screenshot({ path: resolve(path), fullPage: true })
    console.log(`screenshot: ${resolve(path)}`)
  })
}

async function snapshot(argv) {
  const path = argValue(argv, '--path')
  if (!path) usage()
  const urlPath = argValue(argv, '--url') ?? '/'
  await mkdir(dirname(resolve(path)), { recursive: true })
  await withPage(async (page) => {
    await page.goto(`${baseUrl}${urlPath}`, { waitUntil: 'networkidle' })
    const aria = await page.locator('body').ariaSnapshot()
    await writeFile(resolve(path), `${aria}\n`)
    console.log(`snapshot: ${resolve(path)}`)
  })
}

const argv = process.argv.slice(2)
const cmd = argv[0]
if (!cmd || hasFlag(argv, '--help')) usage()

if (cmd === 'paste-source') await pasteSource(argv)
else if (cmd === 'url-source') await urlSource(argv)
else if (cmd === 'pdf-source') await pdfSource(argv)
else if (cmd === 'screenshot') await screenshot(argv)
else if (cmd === 'snapshot') await snapshot(argv)
else usage()
