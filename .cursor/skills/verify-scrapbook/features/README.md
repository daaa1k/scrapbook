# Scrapbook verification map

Maintained source for verifying Scrapbook's user-facing web UI. Read this index, then the matching feature file.

## Baseline preconditions

- Launch with `.cursor/skills/verify-scrapbook/helpers/launch.sh` after `bun run migrate`.
- Base URL `http://127.0.0.1:${VERIFY_PORT:-3000}` with local Access bypass (`ALLOW_INSECURE_AUTH_BYPASS=true`, non-production).
- Run `.cursor/skills/verify-scrapbook/helpers/doctor.sh` and require exit 0 before driving.
- Never drive an instance this run did not launch.
- One driver per checkout. Local D1 under `.wrangler/` is shared.
- Evidence goes to `/cursor/stores/bc-7849fa82-1973-46ca-a837-b0e386645567/media/verify-scrapbook/$VERIFY_RUN_ID/` (or `VERIFY_EVIDENCE_DIR`).

## Driving conventions

- Prefer ARIA roles and accessible names over CSS or coordinates.
- Japanese labels are the stable handles (`本文を保存`, `検索`, `作成`, …).
- Run browser actions through `helpers/drive.mjs` when a subcommand exists; otherwise Playwright against the same base URL with the same naming rules.
- Restore or delete disposable fixtures after mutation. Keep proof artifacts.

## Proof and skip reporting

- Capture action and resulting state (URL + heading/list), not only the final screen.
- UI proof includes a screenshot with the Scrapbook brand visible and an accessibility snapshot when practical.
- Record `featureId` and entry point in `meta.json` beside the artifacts.
- Report unreachable paths with the unmet precondition. Do not claim a different entry point verified the skipped one.

## Feature entry contract

Each feature file: H1, one paragraph, then exactly four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, `Gotchas`.

## Features

- [Create a notebook](./create-notebook.md) covers home create, open, rename, delete, and the post-create source modal.
- [Paste a source](./paste-source.md) covers manual body paste from `/sources` and persistence on the detail page.
- [Search sources](./search-sources.md) covers title/body search and notebook/tag filters on `/sources`.
- [Source detail](./source-detail.md) covers memo, organize, summarize, ask, Markdown export, and delete.
- [Register a URL](./register-url.md) covers URL registration and navigation into the ingest/detail flow.
