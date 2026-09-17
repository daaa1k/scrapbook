# Compat redirects

Compat redirects send legacy `/sources` URLs into the notebook-first routes so old bookmarks keep working.

## Sub-features

- `redirect-sources-index` sends `/sources` and `/sources?notebookId=` to `/` or `/notebooks/$notebookId`.
- `redirect-source-detail` sends `/sources/$sourceId` to `/notebooks/$notebookId?sourceId=…` when the source exists, otherwise `/`.

## How to get to it (user POV)

- Open an old bookmark to `/sources` or `/sources/<id>`.
- The app navigates away from those paths automatically.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- For detail redirect, a known source id from paste-source exists.

- **Index.** `page.goto('$VERIFY_BASE_URL/sources')` then assert final URL is `$VERIFY_BASE_URL/` (trailing slash optional).
- **Notebook filter.** `page.goto('$VERIFY_BASE_URL/sources?notebookId=<uuid>')` then assert `/notebooks/<uuid>`.
- **Detail.** `page.goto('$VERIFY_BASE_URL/sources/<sourceId>')` then assert `/notebooks/<notebookId>` with `sourceId` search.
- **Proof.** Capture response/final URL in `meta.json` under `$VERIFY_EVIDENCE_DIR/compat-redirects/`.

## Gotchas

- These routes are redirect-only. Do not expect the old all-sources list or detail chrome.
- Unknown source ids redirect home.
- Prefer Playwright `waitForURL` after goto rather than asserting the intermediate redirect hop alone.
