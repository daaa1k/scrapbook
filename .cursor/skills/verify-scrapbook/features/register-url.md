# Register a URL

Register URL lets a user submit an `https` URL from the source modal, create a source and fetch job, and land on the notebook page for that ingest.

## Sub-features

- `register-submit` submits the modal `URL` field with `URLを登録`.
- `register-navigate` lands on `/notebooks/$notebookId?sourceId=…`.
- `register-job` shows job/processing status in the center pane (mock or live Cursor).

## How to get to it (user POV)

- Open `/`, choose `新しいノート`, or open a notebook and choose `ソースを追加`.
- Under `URL`, fill `URL`, choose `URLを登録`.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- Prefer a unique URL that will not collide with an existing `normalized_url` (cross-notebook duplicates throw `source_already_registered`).
- Local mock is fine with empty `CURSOR_API_KEY`.

- **Submit.** Go to `/`. Click `新しいノート`. Fill `getByRole('textbox', { name: 'URL' })` with a unique `https://example.com/verify-$VERIFY_RUN_ID`. Click `URLを登録`.
- **Result.** URL becomes `/notebooks/<uuid>`. Center pane shows processing/job status.
- **Proof.** `$VERIFY_EVIDENCE_DIR/register-url/before.png` and `after.png` plus `meta.json` with the URL used.

## Gotchas

- Duplicate URLs in another notebook fail. Same-notebook duplicates reuse the row.
- This path starts ingest Workflow work. Prefer paste-source for fast UI proofs that must not depend on job timing.
- PDF register is a sibling modal section (`PDFファイル` + `PDFを登録`), not covered by this feature file.
- There is no standalone `/sources` register form anymore.
