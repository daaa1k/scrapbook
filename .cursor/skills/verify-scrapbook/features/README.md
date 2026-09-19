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
- Japanese labels are the stable handles (`本文を保存`, `新しいノート`, `質問する`, …).
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

- [Focus and landmarks](./a11y-focus.md) covers the skip link, page `h1`, pane `h2`, and keyboard focus rings.
- [Add a source](./source-add.md) covers the method tabs, discard confirm, and busy submit on the source dialog.
- [Create a notebook](./create-notebook.md) covers home「新しいノート」, open, rename, and cascade delete.
- [Paste a source](./paste-source.md) covers first-source paste via the home modal into `/notebooks/$id`.
- [Register a URL](./register-url.md) covers first-source URL register via the same modal.
- [Note shell](./note-shell.md) covers sources / summarize·ask / memo panes (and mobile tabs), source-list ops, and Q&A delete confirm.
- [Job progress and recovery](./job-progress.md) covers Japanese job labels, per-question progress, failure recovery, and the summarize completion live region.
- [Compat redirects](./compat-redirects.md) covers old `/sources` URLs landing on notebook routes or `/`.

Removed from the map (no UI): standalone `/sources` search list, tag/move controls, reserved inbox.
