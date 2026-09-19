# Create a notebook

Create notebook lets a user open the first-source modal from home, land in a notebook after a successful ingest, rename the notebook, and delete it (with confirm) including cascade cleanup.

## Sub-features

- `notebook-create-cta` opens「新しいノート」and the `新しいノート` / `ソースを追加` dialog with `notebook: 'new'`.
- `notebook-open` opens `/notebooks/$notebookId` from the title or `開く`.
- `notebook-rename` renames from the notebook header (`ノート名` + `名前を変更`).
- `notebook-delete` deletes from home after confirm, including notebooks that still have sources.
- `notebook-cancel` closes the create modal without leaving an empty notebook.

## How to get to it (user POV)

- Open `/` (header brand `Scrapbook`, page heading `ノート`).
- Choose `新しいノート`. The dialog opens on the URL method. Cancel with `閉じる` (icon button) when the fields are empty. Typed input asks `入力を破棄しますか？` instead.
- Complete a paste or URL register in the modal to create and open the notebook. Pick the `貼り付け` tab before filling `タイトル` and `本文`. The URL tab uses `ページのURL`.
- On the notebook page, edit `ノート名` and `名前を変更`.
- On home, choose `削除`. Confirm in the alertdialog that names the notebook and lists ソース, 要約, Q&A, メモ, PDF原本.

## Driving it with Playwright

Preconditions:

- Doctor is green at `$VERIFY_BASE_URL`.
- Prefer unique titles such as `Verify Notebook Alpha-$VERIFY_RUN_ID`.

- **Cancel.** Go to `/`. Click `新しいノート`. Dialog title is `新しいノート`. The tablist `入力方法` is visible and `ページのURL` is the only method form. Click `閉じる`. No discard alertdialog. Home still has no new empty notebook card for an untitled create.
- **Create via paste.** Prefer `helpers/drive.mjs paste-source` (see paste-source feature). Result URL matches `/notebooks/<uuid>`.
- **Open.** From `/`, click the notebook title or `開く`. URL is `/notebooks/<uuid>`.
- **Rename.** On the notebook page, fill `getByRole('textbox', { name: 'ノート名' })`, click `名前を変更`.
- **Delete.** Return to `/`. Click `削除` for that card. An alertdialog opens with initial focus on `キャンセル`. The body lists ソース, 要約, Q&A, メモ, PDF原本. Click `削除` in the dialog. The card disappears. Esc or `キャンセル` leaves the card in place.
- **Proof.** Screenshots under `$VERIFY_EVIDENCE_DIR/create-notebook/`. Brand `Scrapbook` visible.

## Gotchas

- There is no home title form and no empty-notebook create path. First source success creates the notebook.
- The create dialog shows one input method at a time. See [Add a source](./source-add.md).
- Delete always confirms in an in-app alertdialog, not `window.confirm`. Processing jobs reject notebook delete with a Japanese error.
- Rename lives on the notebook page, not on the home card.
