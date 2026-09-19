# Note shell

Note shell is the `/notebooks/$notebookId` three-pane experience: sources on the left, summarize/citations/ask in the center, memo on the right. Narrow screens use tabs without dropping drafts.

## Sub-features

- `shell-open` opens a notebook with optional `?sourceId=`.
- `shell-select` focuses a source from the left list and updates the URL.
- `shell-summarize` / `shell-ask` run from the center pane.
- `shell-memo` edits `ソースのメモ` with debounce/blur save and save-state text. Query invalidation (summarize/ask refetch, post-save refresh) must not replace a dirty or save-error draft. Leaving the notebook (ホームへ, brand `Scrapbook`, back, reload) flushes the draft; a failed flush keeps the draft and shows 再試行 / 破棄.
- `shell-mobile-tabs` switches ソース / 要約・質問 / メモ under `lg`.
- `shell-delete-source` deletes from the left pane with confirm.

## How to get to it (user POV)

- From `/`, open a notebook, or finish first-source create.
- Desktop shows three columns. Narrow screens show a tablist.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- A notebook with at least one pasted source exists (use paste-source).

- **Open.** Navigate to the notebook URL from paste-source `meta.json` `resultUrl`.
- **Select.** Click the source title button inside `#notebook-panel-sources`. That button only focuses the source (`?sourceId=`) and, under `lg`, switches to the study tab. When the source has a URL, a separate link named `{title}を新しいタブで開く` opens the URL in a new tab and must not change selection. Rows without a URL have the select button only.
- **Citations.** After summarize (mock or live), summary text ends with `[1]` footnote buttons (`getByRole('button', { name: '引用1' })`). Click toggles an in-flow excerpt panel under the paragraph (`aria-expanded`). There is no floating tooltip and no separate `引用` region.
- **Memo.** Fill `getByRole('textbox', { name: 'ソースのメモ' })`, blur or wait for `保存済み`. Reload. Memo remains. While a summarize job is in progress (detail refetch every 2s), type more text and confirm the textarea keeps it. Click `← ホームへ` or brand `Scrapbook` with a dirty memo. The draft saves and the home list appears. If save is failed (error on the pane), the same navigation keeps the draft and shows alertdialog `メモを保存できませんでした` with `再試行` and `破棄`. `破棄` restores the last saved memo and continues navigation.
- **Ask.** Fill `getByRole('textbox', { name: '質問' })`, click `質問する`.
- **Mobile tabs.** Set viewport under `lg`, use tablist `ノートの表示切替`, switch tabs, confirm ask draft / memo draft still present.
- **Proof.** Screenshots under `$VERIFY_EVIDENCE_DIR/note-shell/`.

## Gotchas

- Summarize/ask need a non-empty stored body. Paste first.
- In-flight jobs block source delete. Wait for terminal status or use paste-only sources for delete proofs.
- Panes stay mounted when using CSS `hidden` on mobile tabs so drafts survive. Do not remount via full navigation when only switching tabs.
- Tag/move UI is gone. Do not look for notebook/tag comboboxes on this page.
- The leave alertdialog is in the notebook header, not the memo pane, so it stays on screen when the memo tab is CSS-hidden. Reload or tab close with a dirty or failed memo uses the browser `beforeunload` dialog, not the in-app alertdialog. Scope `再試行` / `破棄` to the alertdialog when both the pane error row and the leave dialog are visible.
