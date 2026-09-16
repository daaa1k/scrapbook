# Create a notebook

Create notebook lets a user add a notebook from the home page, open its sources list, rename or delete empty non-inbox notebooks, and optionally add the first source through the post-create modal.

## Sub-features

- `notebook-create` creates a notebook from the home form.
- `notebook-open` opens `/sources?notebookId=…` from the notebook title or `開く`.
- `notebook-rename` renames a non-inbox notebook.
- `notebook-delete` deletes an empty non-inbox notebook.
- `notebook-create-modal` offers URL / PDF / paste in the `ソースを追加` dialog after create.

## How to get to it (user POV)

- Open `/` (header brand `Scrapbook`).
- Enter a name in `ノートブック名` and choose `作成`.
- Choose the notebook title or `開く` to reach its sources.
- Use `名前を変更` or `削除` on the notebook card (disabled for `受信箱` / non-empty).

## Driving it with Playwright

Preconditions:

- Doctor is green at `$VERIFY_BASE_URL`.
- No notebook titled `Verify Notebook Alpha` exists (or use a unique suffix).

- **Create.** Go to `/`. Fill `getByRole('textbox', { name: 'ノートブック名' })` with `Verify Notebook Alpha`. Click `getByRole('button', { name: '作成' })`. The `ソースを追加` dialog (`aria-labelledby=source-modal-title`) opens.
- **Skip modal.** Click `getByRole('button', { name: '閉じる' })`. Home lists a link named `Verify Notebook Alpha`.
- **Open.** Click that link (or `開く`). URL is `/sources` with `notebookId` search param. Heading `URLを登録` is visible.
- **Rename.** Return to `/`. Fill `getByRole('textbox', { name: 'Verify Notebook Alphaの名前' })` with `Verify Notebook Beta`. Click `名前を変更`. The link text becomes `Verify Notebook Beta`.
- **Delete.** With zero sources, click `削除` on that card. The notebook link disappears.
- **Proof.** Screenshots of home before/after create and after delete under `$VERIFY_EVIDENCE_DIR/create-notebook/`. Brand `Scrapbook` visible.

## Gotchas

- Creating a notebook opens the source modal immediately. Close or complete it before asserting the home list alone.
- `受信箱` cannot be renamed or deleted.
- Non-empty notebooks refuse delete. Clear sources first.
- Modal paste/URL/PDF also moves the new source into the created notebook. That is a combined path; still record `create-notebook` plus the ingest feature if both matter.
