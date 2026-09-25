import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { expect, test, SOURCE_BODY } from './fixtures/notebook'

function seedCitations(sourceId: string) {
  const directory = join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  const path = readdirSync(directory).filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
    .map((name) => join(directory, name))
    .find((candidatePath) => {
      const candidate = new Database(candidatePath, { readonly: true })
      try { return Boolean(candidate.prepare("SELECT 1 FROM sqlite_master WHERE name = 'citations'").get()) }
      finally { candidate.close() }
    })
  if (!path) throw new Error('local D1 database not found')
  const db = new Database(path)
  try {
    db.prepare('UPDATE sources SET summary = ? WHERE id = ?').run('開館時間の根拠があります。', sourceId)
    const insert = db.prepare(`INSERT INTO citations (id, source_id, locator, excerpt, created_at)
      VALUES (?, ?, ?, ?, ?)`)
    const excerpt = '午前九時'
    const start = SOURCE_BODY.indexOf(excerpt)
    insert.run(crypto.randomUUID(), sourceId, `${start}:${start + excerpt.length}`, excerpt, 1)
    insert.run(crypto.randomUUID(), sourceId, '-', '位置がない引用', 2)
  } finally {
    db.close()
  }
}

test('mobile citation context highlights only a verified body span and restores keyboard focus', async ({ page, notebook }) => {
  seedCitations(notebook.firstSourceId)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${notebook.path}?sourceId=${notebook.firstSourceId}`)
  const summary = page.getByRole('region', { name: '要約' })
  const first = summary.getByRole('button', { name: '引用1' })
  const footnote = summary.getByRole('region', { name: '引用1' })
  await expect(async () => {
    await first.click()
    await expect(footnote.getByRole('button', { name: '本文で確認' })).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
  await footnote.getByRole('button', { name: '本文で確認' }).click()
  const context = footnote.getByRole('region', { name: '本文の該当箇所' })
  await expect(context.locator('mark')).toHaveText('午前九時')
  await expect(context).toContainText('開館時間は')
  await context.getByRole('button', { name: '閉じる' }).press('Escape')
  await expect(context).toHaveCount(0)
  await expect(first).toBeFocused()

  await summary.getByRole('button', { name: '引用2' }).click()
  const unanchored = summary.getByRole('region', { name: '引用2' })
  await expect(unanchored).toContainText('位置がない引用')
  await expect(unanchored.getByRole('button', { name: '本文で確認' })).toHaveCount(0)
})
