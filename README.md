# Scrapbook

Personal NotebookLM-style app on a single Cloudflare Worker: register a URL or a PDF, ingest URLs with a Cursor cloud agent, poll the job, retry or paste a body when fetch fails, and search title and body.

This vertical slice is **one repo, one Worker, same domain**. No Hono, tRPC, Better Auth, or Vectorize.

## Architecture

```
Browser (TanStack Start + Query)
        │  server functions
        ▼
Worker  src/server.ts
        ├─ TanStack Start fetch handler
        ├─ D1 (notebooks, sources, jobs, cursor_runs, citations)
        ├─ R2 ASSETS (private PDF originals, served only via GET /assets/sources/:id)
        └─ Workflows INGEST_WORKFLOW → IngestWorkflow
                    │
                    ▼
              Cursor Cloud Agents API (no-repo)
```

- **TanStack Start** SSR + server functions, React 19, Tailwind 4.
- **Official Vite** (`vite` + `@cloudflare/vite-plugin`). Not Vite+. Vite+ aliases `vite` and fights the Cloudflare plugin.
- Custom entry `src/server.ts` re-exports TanStack `fetch` **and** the `IngestWorkflow` class.
- Bindings via `import { env } from "cloudflare:workers"`.
- Zod at server functions, Access JWT, Cursor JSON, and Workflow I/O. Effect Schema is not used.
- Effect (`effect` 3.22.2) on the Cursor REST client and job transitions. Typed errors (`CursorNotConfigured`, `CursorApiError`, `IllegalJobTransitionError`) travel the Effect channel. Cloudflare Workflow steps stay Promise-based. `Effect.runPromise` is the bridge.
- `jose` verifies Access JWTs (signature + `iss` + `aud` + `exp` + email allowlist). Never decode-only.

## Data model

| Table | Role |
|---|---|
| `notebooks` | Containers. Title is unique. A default notebook titled `受信箱` is created on first use and cannot be renamed or deleted. |
| `sources` | Ingested URLs / PDFs / pasted bodies. `notebook_id` FK → `notebooks.id`. `summary` is ingest output. `memo` is the user's note. |
| `source_tags` | Labels on sources. Primary key `(source_id, tag_name)`. No separate tags table. |
| `jobs` | Per-ingest state machine. `source_id` FK → `sources.id`. `kind` is `fetch` or `summarize_body`. |
| `cursor_runs` | Cursor run snapshots. `job_id` FK → `jobs.id`. |
| `citations` | Latest quote snapshot for one source. `source_id` FK → `sources.id`. Written on successful Cursor persist and shown on the source detail page. |

**notebook ↔ source:** many sources belong to one notebook (`sources.notebook_id`). A source can move. Duplicate URLs are still one row globally, not one row per notebook. Many-to-many notebooks remain out of scope.

The list filter is `{ q, notebookId, tagName }` combined with AND. Empty `q` means no text predicate. Tag attach is create-if-missing. Organization writes go through `runOrganizationCommand`. Ingest persist, paste, and PDF extract do not write `memo` or `notebook_id`.

Successful persist of `fetch` or `summarize_body` deletes every `citations` row for that `source_id`, then inserts the parsed list. An omitted `citations` key and `[]` both persist as zero rows. A failed Cursor run, paste, and PDF extract do not write this table.

`normalized_url` is unique when present (duplicate URL detection). `acquired_via` is `fetch`, `paste`, or `upload`. `content_hash` is SHA-256 of `body` after a successful fetch, paste, or PDF extract. Do not log `body`, PDF bytes, or API keys.

Re-registering a URL that already has a job returns that job and does **not** start Cursor. Explicit **再取得** on a terminal job (`succeeded` or `failed`) inserts a new job. At most one non-terminal job per source (`jobs_one_active_per_source`). Viewing a source never starts Cursor.

PDF upload writes the original to private R2 at `pdf/{sourceId}/original.pdf`, inserts `kind: 'pdf'` with `acquired_via = upload`, and extracts text in the Worker with `unpdf`. It does **not** start Cursor. Empty extract (scanned PDF) keeps the original, leaves `fetchStatus = failed`, and the detail page asks you to paste. Bytes are served only from authenticated GET `/assets/sources/:id` (add `?download=1` for attachment). There is no public R2 URL. Cap is 8 MiB. Magic bytes must be `%PDF`.

Manual paste writes `title` and `body`, leaves `summary` null, sets `acquired_via = paste` and `fetchStatus = full`, and does not create a job. Paste on a PDF keeps `kind` and `r2_key`.

Explicit **要約する** / **再要約する** on the source detail page starts a job that asks Cursor to summarize the **stored body**. It does not re-fetch the URL and does not re-read R2. The button is shown only when `body` is non-empty. Paste and PDF register still do not auto-summarize.

Title and body search uses SQLite `LIKE` with escaped wildcards, not FTS5. Unicode `LIKE` is good enough for Japanese substrings. FTS5 without a Japanese tokenizer would miss queries that `LIKE` hits. Vectorize is still out of scope.

## Job state machine

Statuses: `queued` | `starting_agent` | `waiting_agent` | `persisting` | `succeeded` | `failed`

```
queued → starting_agent | failed
starting_agent → waiting_agent | failed
waiting_agent → waiting_agent | persisting | failed
persisting → succeeded | failed
succeeded (terminal)
failed (terminal)
```

`waiting_agent → waiting_agent` is the poll loop. Production waits up to 20 sleeps of 15s, then `error_code: timeout`. Encoded in `JOB_TRANSITIONS` + `assertTransition()` (`src/domain/jobs.ts`). Fetch and summarize_body share this machine. They are distinguished by `jobs.kind` and by workflow params `mode`. At most one non-terminal job per source still applies across both kinds.

## Local commands

Requires bun 1.4.2 (via mise) and Node 26.8.2 (mise toolchain; production still runs on Workers, not Node). Tests use `better-sqlite3`, which must be compiled for that Node. After a Node bump, run `npm rebuild better-sqlite3` if Vitest reports an ABI mismatch.

```bash
eval "$(~/.local/bin/mise activate bash)"
bun install
bun run typecheck
bun run test
bun run build
bun run dev          # vite dev (Cloudflare Vite plugin)
bun run migrate      # wrangler d1 migrations apply DB --local
bun run cf-typegen   # wrangler types → worker-configuration.d.ts
bun run secrets      # betterleaks v1.7.1
```

Pre-commit (optional, not a substitute for CI): `bunx lefthook install`

Copy `.dev.vars.example` to `.dev.vars` and set `CURSOR_API_KEY` if you want a live agent. With `ALLOW_INSECURE_AUTH_BYPASS=true` and `ENVIRONMENT=development`, an unset key uses the mock Cursor client so the UI still moves.

## Cloudflare resources to create

Replace placeholder IDs in `wrangler.jsonc` after you create them in the dashboard / CLI:

1. D1 database `scrapbook` — put the real `database_id` in `d1_databases`.
2. R2 bucket `scrapbook-assets`.
3. Worker name `scrapbook` (this repo).
4. Workflow `scrapbook-ingest` is declared in `wrangler.jsonc` (`class_name: IngestWorkflow`). Deploy the Worker; do not create a separate Workflows project.
5. `wrangler secret put CURSOR_API_KEY`
6. Apply migrations remotely: `wrangler d1 migrations apply DB --remote`

Production env in `wrangler.jsonc` sets `ENVIRONMENT=production` and `ALLOW_INSECURE_AUTH_BYPASS=false`.

## Cloudflare Access

You click this in Zero Trust yourself (this repo does not provision Access):

1. Create an Access application for the Worker / hostname.
2. Identity: email OTP (or your IdP).
3. Copy **Application Audience (AUD)** into `ACCESS_AUD`.
4. Team domain `https://<team>.cloudflareaccess.com` into `ACCESS_TEAM_DOMAIN`.
5. Comma-separated exact emails into `ACCESS_ALLOWED_EMAILS`.

The Worker reads `Cf-Access-Jwt-Assertion`, fetches JWKS from `{teamDomain}/cdn-cgi/access/certs`, and runs `jwtVerify` with `iss`, `aud`, and `exp`. Email must match the allowlist exactly.

### Dev bypass

`isInsecureAuthBypassEnabled` is true only when **both**:

- `ALLOW_INSECURE_AUTH_BYPASS` is the string `"true"`
- `ENVIRONMENT !== "production"`

If the flag is set in production config, auth still requires a valid Access JWT. Tests cover this.

## Cursor no-repo prompt

`createAgent` POSTs `{ prompt: { text } }` to `https://api.cursor.com/v1/agents` with `Authorization: Bearer $CURSOR_API_KEY`. **`repos` and `env` are omitted** (no-repo agent). The prompt tells the agent to fetch the URL (curl or equivalent) and reply with **only** JSON:

```json
{
  "title": "string",
  "author": "string | null",
  "publishedAt": "ISO-8601 string | null",
  "body": "string",
  "summary": "string",
  "fetchStatus": "full | partial | failed",
  "failureReason": "string | null",
  "citations": [{ "excerpt": "string", "start": "number | null", "end": "number | null" }]
}
```

`start` and `end` are optional together. They are 0-based half-open JavaScript indexes into `body`.

The Workflow polls `GET /v1/agents/{id}/runs/{runId}`, strips markdown fences from `result`, and Zod-parses that object. There is no separate OpenAI key.

Summarize-from-body uses the same agent API with a different prompt. The agent is given the stored body and must reply with `{ "summary": "string", "citations": [{ "excerpt": "string", "start": "number | null", "end": "number | null" }] }`. Persist writes `summary` and `updatedAt`, and replaces citation rows for that source. It does not write `body` or `memo`.

X/Twitter URLs are stored as `kind: 'x'`. The Cursor prompt adds a note that fetch is unauthenticated. Logged-in X scraping is **not** implemented (unproven without auth).

Production without `CURSOR_API_KEY`: the job fails with `cursor_not_configured` and the UI shows that error (not a spinner forever).

## What is stubbed / out of scope

- PDF R2 path: upload stores the original privately, extracts text with unpdf, serves bytes only through Access-authenticated GET `/assets/sources/:id`. Cursor is not started for PDFs. Scanned PDFs use paste.
- FTS5 / Vectorize: title and body search uses `LIKE`. Vectorize is not in this slice.
- Playwright E2E: upcoming.
- X/Twitter authenticated fetch.
- Backup / export.

## Tooling substitutions

| Memo name | Reality | What this repo ships |
|---|---|---|
| TypeScript 7 | Dual packages from the official Start CF example | Shipped dual: `"@typescript/native": "npm:typescript@^7.0.2"` (this VM's `tsc --version` is **7.0.2**) and `"typescript": "npm:@typescript/typescript6@^6.0.2"` (JS API for tooling). `bun run typecheck` is `tsc --noEmit`. |
| Vite+ | `vite-plus` aliases `vite` | **Not used.** Official `vite` ^8 + Vitest + `@cloudflare/vite-plugin`. |
| Betterleaks | Go CLI, not npm | Pin **v1.7.1** in `mise.toml`. `bun run secrets` uses PATH (mise), else downloads the GitHub release binary to `.bin/` (gitignored). If that fails it exits non-zero with install instructions (`go install github.com/betterleaks/betterleaks@v1.7.1`). |
| `@tanstack/react-router-ssr-query` | Match router `^1.170.36` | **1.167.2** is the latest published as of this slice (router is 1.170.36). |

Plugin order in `vite.config.ts` (official example):

```ts
tailwindcss(),
cloudflare({ viteEnvironment: { name: 'ssr' } }),
tanstackStart(),
viteReact(),
```

## Workflows on this VM

The Workflow **class**, wrangler **binding**, and `INGEST_WORKFLOW.create({ params })` are real. Unit tests run `runIngestWorkflow` with a fake `step` and mock Cursor client (no Cloudflare account, no live key). Local `vite dev` / `wrangler dev` is the place Workflows actually execute; if the Cloudflare plugin cannot run Workflows in a given environment, jobs may stay `queued` or fail with `workflow_start_failed` — that is not faked green in CI.

## License

MIT. See `LICENSE`.
