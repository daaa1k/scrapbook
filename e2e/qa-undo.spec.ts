import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { expect, test, FIRST_SOURCE, SECOND_SOURCE, sourceButton } from './fixtures/notebook'

function seedAnsweredQuestions(sourceId: string) {
  const directory = join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  const dbPath = readdirSync(directory).filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
    .map((name) => join(directory, name))
    .find((path) => {
      const candidate = new Database(path, { readonly: true })
      try { return Boolean(candidate.prepare("SELECT 1 FROM sqlite_master WHERE name = 'qa_answers'").get()) }
      finally { candidate.close() }
    })
  if (!dbPath) throw new Error('local D1 database not found')
  const db = new Database(dbPath)
  try {
    const insertJob = db.prepare(`INSERT INTO jobs (id, source_id, kind, status, created_at, updated_at)
      VALUES (?, ?, 'ask_source', 'succeeded', ?, ?)`)
    const insertAnswer = db.prepare(`INSERT INTO qa_answers (id, source_id, job_id, question, answer, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    const now = Date.now()
    for (const [index, question] of ['取り消す質問', '確定する質問'].entries()) {
      const id = crypto.randomUUID()
      const jobId = crypto.randomUUID()
      insertJob.run(jobId, sourceId, now + index, now + index)
      insertAnswer.run(id, sourceId, jobId, question, `${question}の回答`, now + index, now + index)
    }
  } finally {
    db.close()
  }
}

test('two pending question deletions survive a source switch and undo independently', async ({ page, notebook }) => {
  test.setTimeout(60_000)
  seedAnsweredQuestions(notebook.firstSourceId)
  await page.goto(`${notebook.path}?sourceId=${notebook.firstSourceId}`)
  const turn = (question: string) => page.locator('[id^="qa-turn-"]').filter({ hasText: question })
  await expect(turn('取り消す質問')).toBeVisible()
  for (const question of ['取り消す質問', '確定する質問']) {
    await expect(async () => {
      await turn(question).getByRole('button', { name: 'この質問と回答を削除' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 1_000 })
    }).toPass({ timeout: 10_000 })
    await page.getByRole('alertdialog').getByRole('button', { name: '削除' }).click()
  }
  const pending = page.getByRole('status').filter({ hasText: '削除予約中' })
  await expect(pending).toHaveCount(2)
  await pending.filter({ hasText: '取り消す質問' }).getByRole('button', { name: '元に戻す' }).click()
  await expect(pending).toHaveCount(1)
  await sourceButton(page, SECOND_SOURCE).click()
  await expect(page).toHaveURL(new RegExp(`sourceId=${notebook.secondSourceId}`))
  await sourceButton(page, FIRST_SOURCE).click()
  await expect(pending).toHaveCount(1)
  await expect(turn('取り消す質問')).toBeVisible()
  await expect(pending).toHaveCount(0, { timeout: 15_000 })
  await expect(turn('確定する質問')).toHaveCount(0)
  await expect(turn('取り消す質問')).toBeVisible()
})
