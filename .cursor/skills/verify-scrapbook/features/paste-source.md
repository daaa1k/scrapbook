# Paste a source

Paste source lets a user save a title and body without Cursor, land on the source detail page, and confirm the stored title as the page heading.

## Sub-features

- `paste-open` reaches the paste form on `/sources`.
- `paste-save` persists title and body and navigates to `/sources/$sourceId`.
- `paste-confirm` shows the saved title as the detail `h1`.

## How to get to it (user POV)

- Choose header `ソース`, or open a notebook then use the sources page.
- Under `本文を手動で貼り付け`, fill `タイトル` and `本文`, optionally `URL（任意）`.
- Choose `本文を保存`.
- Alternate entry: after creating a notebook, use `本文を貼り付け` inside `ソースを追加`.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- Helper deps installed (`helpers/` `bun install` + `bunx playwright install chromium`).

- **Open form.** Run `.cursor/skills/verify-scrapbook/helpers/drive.mjs paste-source --title "Verify Paste Title" --body "Verify paste body for scrapbook."`. The helper opens `/sources`, waits for heading `本文を手動で貼り付け`, fills `タイトル` / `本文`, clicks `本文を保存`.
- **Result.** Browser URL matches `/sources/<id>`. Detail `h1` is `Verify Paste Title`.
- **Proof.** `$VERIFY_EVIDENCE_DIR/paste-source/before.png`, `after.png`, `aria.txt`, `meta.json`. `after.png` shows brand `Scrapbook` and the title heading.

Manual equivalent if extending the helper:

- `page.goto('$VERIFY_BASE_URL/sources')`
- `page.getByRole('textbox', { name: 'タイトル' }).fill(...)`
- `page.getByRole('textbox', { name: '本文' }).fill(...)`
- `page.getByRole('button', { name: '本文を保存' }).click()`
- `page.waitForURL(/\/sources\/[^/]+$/)`

## Gotchas

- Paste does not start Cursor. Do not wait for a job status on this path.
- Detail heading falls back to `無題のソース` only when title is missing. Assert the exact title you saved.
- Multiple textboxes named `タイトル` appear if the source modal is open. Close modals first or scope to the sources page section.
- Cleanup of the created source is optional fixture hygiene. Never delete the evidence directory.
