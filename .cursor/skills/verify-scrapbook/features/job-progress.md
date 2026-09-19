# Job progress and recovery

The study pane turns job status into Japanese progress, and failed jobs into cause, impact, and a next action. After a question, each turn shows its own pending or failed state instead of a single `回答待ち…` line.

## Sub-features

- `job-progress-label` replaces internal names such as `queued` with Japanese text and a spinner. Examples: `本文の取得を準備しています`, `要約しています`, `回答を準備しています`.
- `job-progress-per-question` shows that label on the waiting turn after `質問する`. The turn does not use `回答待ち…`.
- `job-copy` adds `コピー` on ready summary and answer blocks, and on open citation excerpts. Success announces `コピーしました` in `#investigate-copy-status`.
- `job-question-examples` shows clickable example prompts when the Q&A list is empty and the source has body text.
- `job-failure-recovery` shows an alert with cause and impact. URL fetch failure offers `本文を貼り付ける` and `再取得` or `再試行`. A missing Cursor key explains that an admin must set it and offers no retry. Timeout offers `再試行`.
- `job-empty-body` shows `本文がありません` and a paste form titled `本文の貼り付け` when the source has no body and no job is running.
- `job-complete-live` writes one sentence into `#investigate-job-complete` (`role="status"`) when a job becomes `succeeded`. In-flight poll labels are not live.

## How to get to it (user POV)

- Open a notebook source in `要約・質問`.
- Choose `要約する` or type a `質問` and choose `質問する`.
- If fetch fails, read the alert and paste a body or retry.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- A pasted source exists, or run `helpers/drive.mjs job-progress`.

- **Scope.** The study header includes `回答元:`. It does not include `queued` or `回答対象はこのソースのみ`.
- **Summarize group.** The `要約` region keeps `まだありません` and `要約する` together. Click `要約する`. The page shows `要約を準備しています` or `要約しています` while the job runs, then summary text. `#investigate-job-complete` becomes `要約が完了しました` after success. It does not change on every poll.
- **Ask progress.** Fill `質問` with a short sentence. Click `質問する`. The new turn shows `回答を準備しています` or `回答しています` and a spinner. It does not show `回答待ち…` while waiting. A failed empty answer shows `回答できませんでした`, not `回答待ち…`.
- **Paste when empty.** On a source with no body, the paste form `本文の貼り付け` is visible. `要約する` is not the only next step.
- **Proof.** Screenshots and an accessibility snapshot under `$VERIFY_EVIDENCE_DIR/job-progress/`.

## Gotchas

- Local mock Cursor can finish in one poll. Capture the pending label immediately after submit, or seed a `queued` / `failed` row in local D1 and reload. Do not treat a finished mock answer as proof of the pending label.
- `#investigate-job-complete` is visually hidden. Read its text content. Do not require it to be on screen.
- Paste recovery writes onto the current source (`pasteSource` with `sourceId`). It does not open the add-source dialog.
- `再試行` on an ask failure sends the same question again and adds a new turn. The failed turn stays until `削除`.
- Copy buttons, question examples, and Q&A undo are out of this unit.
