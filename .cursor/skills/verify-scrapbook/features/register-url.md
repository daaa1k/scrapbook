# Register a URL

Register URL lets a user submit an `https` URL from `/sources`, create a source and fetch job, and land on the source detail page for that ingest.

## Sub-features

- `register-submit` submits the `URL` field with `URLを登録`.
- `register-navigate` lands on `/sources/$sourceId`.
- `register-job` shows job/processing status on detail (mock or live Cursor).

## How to get to it (user POV)

- Open `/sources`.
- Under `URLを登録`, fill `URL`, choose `URLを登録`.
- Alternate: post-create `ソースを追加` modal URL section.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- Prefer a unique URL that will not collide with an existing `normalized_url` (re-register returns the existing job without starting Cursor).
- Local mock is fine with empty `CURSOR_API_KEY`.

- **Submit.** Go to `/sources`. Fill `getByRole('textbox', { name: 'URL' })` with a unique `https://example.com/verify-$VERIFY_RUN_ID`. Click `getByRole('button', { name: 'URLを登録' })`.
- **Result.** URL becomes `/sources/<id>`. Detail shows the source chrome and a processing/job status line.
- **Proof.** `$VERIFY_EVIDENCE_DIR/register-url/before.png` and `after.png` plus `meta.json` with the URL used.

## Gotchas

- Duplicate URLs return the existing source/job and do not start a new Cursor run. Use a unique path per proof.
- This path starts ingest Workflow work. Prefer paste-source for fast UI proofs that must not depend on job timing.
- PDF register is a sibling form (`PDFファイル` + `PDFを登録`), not covered by this feature file.
- Modal and page both expose `aria-label="URL"`. Scope to the visible page section when both could match.
