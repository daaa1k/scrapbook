import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { expect, test, FIRST_SOURCE } from './fixtures/notebook'

test('loads later source pages and opens a selected source beyond the first page', async ({ page, notebook }) => {
  const directory = join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject')
  const path = readdirSync(directory).filter((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite')
    .map((name) => join(directory, name)).find((file) => {
      const candidate = new Database(file, { readonly: true })
      try { return Boolean(candidate.prepare("SELECT 1 FROM sqlite_master WHERE name = 'sources'").get()) }
      finally { candidate.close() }
    })
  if (!path) throw new Error('local D1 database not found')
  const db = new Database(path)
  const notebookId = notebook.path.split('/').at(-1)!
  const selectedId = crypto.randomUUID()
  try {
    const insert = db.prepare(`INSERT INTO sources
      (id, notebook_id, kind, title, body, fetch_status, acquired_via, created_at, updated_at)
      VALUES (?, ?, 'paste', ?, '本文', 'full', 'paste', ?, ?)`)
    const now = Date.now()
    for (let index = 0; index < 29; index++) {
      insert.run(index === 28 ? selectedId : crypto.randomUUID(), notebookId,
        index === 28 ? '選択する古い資料' : `追加資料 ${index}`, now - 1000 - index, now - 1000 - index)
    }
  } finally { db.close() }
  await page.goto(`${notebook.path}?sourceId=${selectedId}`)
  await expect(page.getByRole('tabpanel', { name: '要約・質問' })).toContainText('選択する古い資料')
  await expect(page.getByRole('button', { name: 'さらにソースを表示' })).toBeVisible()
  await page.getByRole('button', { name: 'さらにソースを表示' }).click()
  await expect(page.getByRole('tabpanel', { name: 'ソース' })).toContainText('選択する古い資料')
  await expect(page.getByRole('tabpanel', { name: 'ソース' })).toContainText(FIRST_SOURCE)
})
