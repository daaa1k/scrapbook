# Source detail

Source detail lets a user inspect one source, edit organization fields, start summarize/ask jobs, export Markdown, and delete the source when no job is in flight.

## Sub-features

- `detail-open` opens `/sources/$sourceId` from the list.
- `detail-memo` saves `自分のメモ`.
- `detail-organize` moves notebook and attaches/detaches tags.
- `detail-summarize` starts summarize when body is non-empty (`要約する` / `再要約する`).
- `detail-ask` asks a question (`質問` + `質問する`).
- `detail-export` downloads Markdown via `Markdownを書き出す`.
- `detail-delete` removes the source with `ソースを削除`.

## How to get to it (user POV)

- From `/sources`, choose a source title card.
- After URL/PDF/paste registration, the app navigates here automatically.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- A pasted source with known title exists (paste does not need Cursor).

- **Open.** Navigate to the detail URL from paste-source result, or click the list link by title.
- **Memo.** Fill `getByRole('textbox', { name: '自分のメモ' })`, click `getByRole('button', { name: 'メモを保存' })`. Reload or revisit. Memo text remains.
- **Organize.** Change `getByRole('combobox', { name: 'ノートブック' })`, click `移動する`. Attach a tag with `タグ` + `付ける`.
- **Summarize.** With non-empty body and idle job, click `要約する`. Job status text updates (local mock Cursor without `CURSOR_API_KEY`). Wait until terminal status or bound the wait in the run notes.
- **Ask.** Fill `getByRole('textbox', { name: '質問' })`, click `質問する`. A Q&A turn appears.
- **Export.** Click `Markdownを書き出す` (browser download). Confirm download in the driver download event when asserting.
- **Delete.** Click `ソースを削除`. Navigation returns away from the detail URL. List no longer shows the title.
- **Proof.** Action + result screenshots under `$VERIFY_EVIDENCE_DIR/source-detail/`. For jobs, capture in-progress and terminal states.

## Gotchas

- Summarize/ask need a non-empty stored body. Paste first.
- In-flight jobs block delete and some actions. Wait for terminal status or use paste-only sources for delete proofs.
- Production Access is irrelevant locally. Live Cursor needs `CURSOR_API_KEY` in `.dev.vars`; empty key uses mock answers.
- Export is client-side download of the loaded view, not a new server route.
