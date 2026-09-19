# Register a URL

Register URL lets a user submit an `https` URL from the source modal, create a source and fetch job, and land on the notebook page for that ingest.

## Sub-features

- `register-submit` submits the modal `ページのURL` field with `URLを登録`.
- `register-navigate` lands on `/notebooks/$notebookId?sourceId=…`.
- `register-job` shows job/processing status in the center pane (mock or live Cursor).

## How to get to it (user POV)

- Open `/`, choose `新しいノート`, or open a notebook and choose `ソースを追加`.
- The dialog opens on the `URL` method. Fill `ページのURL`, choose `URLを登録`.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- Prefer a unique URL that will not collide with an existing `normalized_url` (cross-notebook duplicates throw `source_already_registered`).
- Local mock is fine with empty `CURSOR_API_KEY`.

- **Submit.** Run `.cursor/skills/verify-scrapbook/helpers/drive.mjs url-source --url https://example.com/verify-$VERIFY_RUN_ID`, or go to `/`, click `新しいノート`, fill `getByRole('textbox', { name: 'ページのURL' })` with a unique `https://example.com/verify-$VERIFY_RUN_ID`, click `URLを登録`.
- **Result.** URL becomes `/notebooks/<uuid>`. Center pane shows processing/job status.
- **Proof.** `$VERIFY_EVIDENCE_DIR/register-url/before.png` and `after.png` plus `meta.json` with the URL used.

## Gotchas

- Duplicate URLs in another notebook fail. Same-notebook duplicates reuse the row.
- This path starts ingest Workflow work. Prefer paste-source for fast UI proofs that must not depend on job timing.
- PDF register is a sibling method tab (`PDF` + `PDFファイル` + `PDFを登録`), not covered by this feature file. See [Add a source](./source-add.md).
- Leading and trailing spaces in the URL are trimmed before submit.
- There is no standalone `/sources` register form anymore.
