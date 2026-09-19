---
name: verify-scrapbook
description: "Drive the Scrapbook web UI (TanStack Start on Cloudflare Workers) like a user: launch local Vite, doctor the instance, exercise mapped features via Playwright, and keep proof under the named evidence directory. Use when proving Scrapbook UI behavior, after UI changes, or before claiming a feature works."
---

# Verify Scrapbook

Agent-facing control skill for Scrapbook. Primary surface is the **browser web UI**. Secondary surfaces (server functions, D1, Workflows, Cursor API) are exercised only through that UI unless a feature file says otherwise.

Read `features/README.md` before driving. Drive recipes from the matching feature file. Never invent selectors.

## Interview facts (do not skip)

- **Surface:** Web UI at `/` (notebook list +「新しいノート」) and `/notebooks/$notebookId` (three-pane note shell). Japanese copy. Brand link `Scrapbook` goes to `/`. Old `/sources` and `/sources/$sourceId` redirect into a notebook URL or `/`.
- **Run:** `bun run migrate` once per checkout, then `bun run dev` (Vite + Cloudflare plugin) on port **3000** by default. Auth bypass is on when `wrangler.jsonc` has `ENVIRONMENT=development` and `ALLOW_INSECURE_AUTH_BYPASS=true` (default local). Copy `.dev.vars.example` → `.dev.vars` if missing. Empty `CURSOR_API_KEY` uses the mock Cursor client locally. Production dogfood `https://scrapbook.dd41kk.workers.dev` is Cloudflare Access gated; do **not** treat it as the default verification target unless Access credentials are available.
- **Drive:** Repo has **no** Playwright/Cypress e2e suite. This skill ships a Playwright helper under `helpers/`. Prefer ARIA names and visible Japanese button labels already in the app. CDP against a manual Chrome is a fallback only if Playwright cannot start; document that honestly in the run notes.
- **Observe:** Screenshots (PNG), ARIA/accessibility snapshots (txt), HTTP doctor output, page URL after navigation. Optional: local D1 under `.wrangler/state` (shared; not a proof substitute for UI).
- **Isolate:** One verification instance per checkout. Local D1/R2 state lives in `.wrangler/` and is **shared** across Vite processes on this tree. Do not double-drive. Use `VERIFY_PORT` only when the default port is taken by **your** previous dead run after cleanup failed; still one driver at a time.

## Paths

| Item | Exact path |
|---|---|
| This skill | `.cursor/skills/verify-scrapbook/SKILL.md` |
| Feature map | `.cursor/skills/verify-scrapbook/features/` |
| Helpers | `.cursor/skills/verify-scrapbook/helpers/` |
| Run state (pid/log) | `/tmp/verify-scrapbook-$VERIFY_RUN_ID/` |
| **Evidence (canonical)** | `/cursor/stores/bc-7849fa82-1973-46ca-a837-b0e386645567/media/verify-scrapbook/$VERIFY_RUN_ID/` |

Set `VERIFY_EVIDENCE_DIR` to override the evidence root. Cleanup **must not** delete that directory. If the Project store path is unavailable, set `VERIFY_EVIDENCE_DIR` to an absolute directory you control and name it in the run report.

Default base URL: `http://127.0.0.1:${VERIFY_PORT:-3000}`.

## Launch

From the repo root (mise/bun toolchain active: `bun` 1.4.2, Node 26.8.2):

```bash
export VERIFY_RUN_ID="${VERIFY_RUN_ID:-$(date +%Y%m%d-%H%M%S)-$$}"
export VERIFY_PORT="${VERIFY_PORT:-3000}"
export VERIFY_BASE_URL="http://127.0.0.1:${VERIFY_PORT}"
export VERIFY_EVIDENCE_DIR="${VERIFY_EVIDENCE_DIR:-/cursor/stores/bc-7849fa82-1973-46ca-a837-b0e386645567/media/verify-scrapbook/${VERIFY_RUN_ID}}"
mkdir -p "$VERIFY_EVIDENCE_DIR"
test -f .dev.vars || cp .dev.vars.example .dev.vars
bun run migrate
.cursor/skills/verify-scrapbook/helpers/launch.sh
```

Ready when `helpers/doctor.sh` exits 0 (HTTP 200 and body contains `Scrapbook`). Teardown is `helpers/cleanup.sh` (kills only the pid this launch wrote).

## Doctor

```bash
.cursor/skills/verify-scrapbook/helpers/doctor.sh
```

Read-only. Checks: pid file alive, `GET $VERIFY_BASE_URL/` returns 200, HTML includes `Scrapbook`. Run before the first drive and after any failed drive. If doctor fails, cleanup, relaunch, doctor again. Do not drive a foreign process on the port.

## Drive

Install helper deps once per machine:

```bash
( cd .cursor/skills/verify-scrapbook/helpers && bun install )
```

Playwright browser (Chromium headless shell) once:

```bash
( cd .cursor/skills/verify-scrapbook/helpers && bunx playwright install chromium )
```

Drive via the helper (see feature files for recipes):

```bash
.cursor/skills/verify-scrapbook/helpers/drive.mjs <subcommand> [args]
```

Subcommands:

- `paste-source --title <t> --body <b>` — home「新しいノート」modal; select `貼り付け`; prove `/notebooks/$id?sourceId=…`.
- `url-source --url <url>` — home「新しいノート」modal URL method; prove `/notebooks/$id`.
- `pdf-source --file <path>` — home「新しいノート」modal PDF method; prove `/notebooks/$id`.
- `screenshot --path <file> [--url <path>]` — capture a page.
- `snapshot --path <file> [--url <path>]` — accessibility snapshot text.

Prefer role + accessible name. Example names already in the app: `新しいノート`, `ページのURL`, `タイトル`, `本文`, `ノート名`, `ソースのメモ`, `質問`, buttons `URLを登録`, `本文を保存`, `名前を変更`, `削除`, `ソースを追加`, `質問する`, `要約する`, tablist `入力方法`.

## Evidence

For every proof:

1. Capture the **action** (pre-submit screenshot or snapshot) and the **result** (post-navigation URL + heading/list state).
2. Write under `$VERIFY_EVIDENCE_DIR/<feature-id>/` with stable names (`before.png`, `after.png`, `aria.txt`, `meta.json`).
3. `meta.json` must include `featureId`, `entryPoint`, `baseUrl`, `runId`, and ISO timestamp.
4. Exercise the real UI path. Do not call server functions from a script and call that a UI proof.
5. Mocks: empty `CURSOR_API_KEY` under local bypass is the allowed boundary for Cursor; still drive summarize/ask through the UI when those features are under test.

## Cleanup

```bash
.cursor/skills/verify-scrapbook/helpers/cleanup.sh
```

Kills only the Vite/dev pid recorded for `$VERIFY_RUN_ID`. Does **not** delete `$VERIFY_EVIDENCE_DIR`. Does **not** wipe `.wrangler` (shared local data). After cleanup, confirm evidence still exists at the named path.

## Helpers

| Script | Invocation |
|---|---|
| `helpers/launch.sh` | `.cursor/skills/verify-scrapbook/helpers/launch.sh` |
| `helpers/doctor.sh` | `.cursor/skills/verify-scrapbook/helpers/doctor.sh` |
| `helpers/cleanup.sh` | `.cursor/skills/verify-scrapbook/helpers/cleanup.sh` |
| `helpers/drive.mjs` | `.cursor/skills/verify-scrapbook/helpers/drive.mjs <subcommand> …` |

All are executable. They read `VERIFY_RUN_ID`, `VERIFY_PORT`, `VERIFY_BASE_URL`, `VERIFY_EVIDENCE_DIR`.

## Maintenance

When the UI or routes drift, run `/maintain-verification-skill` against this skill. Do not quietly paper over product regressions in the map.
