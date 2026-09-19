# Paste a source

Paste source lets a user save a title and body as the first source of a new notebook (or into an open notebook), then land on `/notebooks/$notebookId` with that source selected.

## Sub-features

- `paste-open` opens the source modal from home「新しいノート」or notebook「ソースを追加」, then selects the `貼り付け` method tab.
- `paste-save` persists title and body and navigates to `/notebooks/$notebookId?sourceId=…`.
- `paste-confirm` shows the saved title in the center pane.

## How to get to it (user POV)

- On `/`, choose `新しいノート`, or on a notebook choose `ソースを追加`.
- Choose the `貼り付け` tab. Fill `タイトル` and `本文`, optionally `URL（任意）`.
- Choose `本文を保存`.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- Helper deps installed (`helpers/` `bun install` + `bunx playwright install chromium`).

- **Open form.** Run `.cursor/skills/verify-scrapbook/helpers/drive.mjs paste-source --title "Verify Paste Title" --body "Verify paste body for scrapbook."`. The helper opens `/`, clicks `新しいノート`, clicks tab `貼り付け`, fills paste fields inside the dialog, clicks `本文を保存`.
- **Result.** Browser URL matches `/notebooks/<uuid>` (optional `sourceId` search). Center pane shows the pasted title.
- **Proof.** `$VERIFY_EVIDENCE_DIR/paste-source/before.png`, `after.png`, `aria.txt`, `meta.json`.

Manual equivalent if extending the helper:

- `page.goto('$VERIFY_BASE_URL/')`
- `page.getByRole('button', { name: '新しいノート' }).click()`
- Scope fills to the open `dialog`
- `page.waitForURL(/\/notebooks\/[^/]+/)`

## Gotchas

- Paste does not start Cursor. Do not wait for a job status on this path.
- `/sources` no longer hosts a paste form. It redirects to `/`.
- The paste fields are hidden until the `貼り付け` tab is selected. URL, PDF, and paste forms are never visible together.
- Multiple textboxes named `タイトル` can appear if more than one dialog is open. Drive one modal at a time.
- Cleanup of the created notebook/source is optional fixture hygiene. Never delete the evidence directory.
