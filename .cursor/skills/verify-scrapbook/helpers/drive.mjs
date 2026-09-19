#!/usr/bin/env bun
import { Database } from 'bun:sqlite'
import { Glob } from 'bun'
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
  drive.mjs job-progress [--out <dir>]
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
    await dialog.getByRole('tab', { name: '貼り付け' }).click()
    await page.screenshot({ path: resolve(out, 'before.png'), fullPage: true })

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

function sourceIdFromUrl(url) {
  try {
    return new URL(url).searchParams.get('sourceId')
  } catch {
    return null
  }
}

function findLocalD1WithSource(sourceId) {
  const root = resolve('.wrangler/state/v3/d1')
  const glob = new Glob('**/*.sqlite')
  for (const file of glob.scanSync({ cwd: root, absolute: true })) {
    const db = new Database(file)
    try {
      const row = db.query('select id from sources where id = ?').get(sourceId)
      if (row) return { db, file }
    } catch {
      db.close()
      continue
    }
    db.close()
  }
  return null
}

function seedAskJob(sourceId, status, errorCode = null) {
  const found = findLocalD1WithSource(sourceId)
  if (!found) return null
  const now = Date.now()
  const jobId = crypto.randomUUID()
  const qaId = crypto.randomUUID()
  found.db.run(
    `insert into jobs (id, source_id, kind, status, error_code, error_message, attempt_count, created_at, updated_at, finished_at)
     values (?, ?, 'ask_source', ?, ?, ?, 1, ?, ?, ?)`,
    [jobId, sourceId, status, errorCode, errorCode ? 'seeded' : null, now, now, status === 'failed' ? now : null],
  )
  found.db.run(
    `insert into qa_answers (id, source_id, job_id, question, answer, created_at, updated_at)
     values (?, ?, ?, ?, null, ?, ?)`,
    [qaId, sourceId, jobId, status === 'failed' ? '失敗した質問' : '進捗確認の質問', now, now],
  )
  found.db.close()
  return { jobId, qaId, file: found.file }
}

function failSeededAsk(jobId, sourceId) {
  const found = findLocalD1WithSource(sourceId)
  if (!found) return null
  const now = Date.now()
  found.db.run(
    `update jobs set status = 'failed', error_code = 'timeout', error_message = 'seeded', finished_at = ?, updated_at = ? where id = ?`,
    [now, now, jobId],
  )
  found.db.close()
  return { jobId }
}

function seedFailedFetch(sourceId) {
  const found = findLocalD1WithSource(sourceId)
  if (!found) return null
  const now = Date.now()
  found.db.run(
    `update jobs set status = 'failed', kind = 'fetch', error_code = 'timeout', error_message = 'seeded', finished_at = ?, updated_at = ? where source_id = ? and status not in ('succeeded', 'failed')`,
    [now, now, sourceId],
  )
  const latest = found.db
    .query(`select id from jobs where source_id = ? order by created_at desc, rowid desc limit 1`)
    .get(sourceId)
  if (latest?.id) {
    found.db.run(
      `update jobs set status = 'failed', kind = 'fetch', error_code = 'timeout', error_message = 'seeded', finished_at = ?, updated_at = ? where id = ?`,
      [now, now, latest.id],
    )
  } else {
    found.db.run(
      `insert into jobs (id, source_id, kind, status, error_code, error_message, attempt_count, created_at, updated_at, finished_at)
       values (?, ?, 'fetch', 'failed', 'timeout', 'seeded', 1, ?, ?, ?)`,
      [crypto.randomUUID(), sourceId, now, now, now],
    )
  }
  found.db.run(`update sources set body = null, fetch_status = 'failed', updated_at = ? where id = ?`, [
    now,
    sourceId,
  ])
  found.db.close()
  return { jobId: latest?.id ?? null, file: found.file }
}

async function jobProgress(argv) {
  const title = `進捗確認 ${runId}`
  const body = 'これは進捗確認用の本文です。要約と質問のラベルを見ます。'
  const out = resolve(argValue(argv, '--out') ?? resolve(evidenceRoot, 'job-progress'))
  await mkdir(out, { recursive: true })

  await withPage(async (page) => {
    const dialog = await openCreateDialog(page)
    await dialog.getByRole('tab', { name: '貼り付け' }).click()
    await dialog.getByRole('textbox', { name: 'タイトル' }).fill(title)
    await dialog.getByRole('textbox', { name: '本文' }).fill(body)
    await dialog.getByRole('button', { name: '本文を保存' }).click()
    await page.waitForURL(/\/notebooks\/[^/]+/, { timeout: 30_000 })
    await page.getByText(title, { exact: true }).first().waitFor({ timeout: 30_000 })

    const notebookUrl = page.url()
    const sourceId = sourceIdFromUrl(notebookUrl)
    const study = page.locator('#notebook-panel-study')
    const idleText = await study.innerText()
    await page.screenshot({ path: resolve(out, 'idle.png'), fullPage: true })

    await page.getByRole('button', { name: '要約する' }).click()
    const summarizePending = await page
      .getByText(/要約を準備しています|要約しています|結果を保存しています/)
      .first()
      .waitFor({ timeout: 2_000 })
      .then(() => true)
      .catch(() => false)
    if (summarizePending) {
      await page.screenshot({ path: resolve(out, 'summarize-pending.png'), fullPage: true })
    }
    await page.getByText('モック要約').waitFor({ timeout: 30_000 })
    const completeText = await page.locator('#investigate-job-complete').innerText()
    await page.screenshot({ path: resolve(out, 'summarize-after.png'), fullPage: true })

    await page.getByRole('textbox', { name: '質問' }).fill('要点は何ですか')
    await page.getByRole('button', { name: '質問する' }).click()
    const askPending = await page
      .getByText(/回答を準備しています|回答しています|結果を保存しています/)
      .first()
      .waitFor({ timeout: 2_000 })
      .then(() => true)
      .catch(() => false)
    if (askPending) {
      await page.screenshot({ path: resolve(out, 'ask-pending.png'), fullPage: true })
    }
    await page
      .getByText(/モック回答です。|回答できませんでした/)
      .first()
      .waitFor({ timeout: 30_000 })
    const askWaiting = await page.getByText('回答待ち…').count()

    let seededPending = null
    let seededFailedAsk = null
    let seededFailedFetch = null
    if (sourceId) {
      seededPending = seedAskJob(sourceId, 'queued')
      if (seededPending) {
        await page.reload({ waitUntil: 'networkidle' })
        await page.getByText('進捗確認の質問').waitFor({ timeout: 10_000 })
        await page.screenshot({ path: resolve(out, 'ask-seeded-pending.png'), fullPage: true })
        seededFailedAsk = failSeededAsk(seededPending.jobId, sourceId)
        if (seededFailedAsk) {
          await page.reload({ waitUntil: 'networkidle' })
          await page.getByText('回答できませんでした').first().waitFor({ timeout: 10_000 })
          await page.screenshot({ path: resolve(out, 'ask-seeded-failed.png'), fullPage: true })
        }
      }
    }

    const aria = await page.locator('body').ariaSnapshot()
    await writeFile(resolve(out, 'aria.txt'), `${aria}\n`)

    let fetchRecovery = null
    if (sourceId) {
      seededFailedFetch = seedFailedFetch(sourceId)
      if (seededFailedFetch) {
        await page.reload({ waitUntil: 'networkidle' })
        await page.getByText('本文を取得できませんでした').waitFor({ timeout: 10_000 })
        await page.screenshot({ path: resolve(out, 'fetch-failed.png'), fullPage: true })
        fetchRecovery = {
          hasPasteForm: (await page.getByRole('form', { name: '本文の貼り付け' }).count()) > 0,
          hasRetry: (await page.getByRole('button', { name: /再試行|再取得/ }).count()) > 0,
        }
      }
    }

    await writeMeta(out, {
      featureId: 'job-progress',
      entryPoint: '/#new-notebook-paste',
      resultUrl: notebookUrl,
      sourceId,
      title,
      idleHasScope: idleText.includes('回答元:'),
      idleHasQueued: idleText.includes('queued'),
      idleHasOldScope: idleText.includes('回答対象はこのソースのみ'),
      summarizePending,
      completeText,
      askPending,
      askWaitingCount: askWaiting,
      seededPending,
      seededFailedAsk,
      seededFailedFetch,
      fetchRecovery,
    })
    console.log(`job-progress: ok url=${notebookUrl} evidence=${out}`)
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
else if (cmd === 'job-progress') await jobProgress(argv)
else if (cmd === 'screenshot') await screenshot(argv)
else if (cmd === 'snapshot') await snapshot(argv)
else usage()
