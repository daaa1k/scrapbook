# Note shell

Note shell is the `/notebooks/$notebookId` three-pane experience: sources on the left, summarize/citations/ask in the center, memo on the right. Narrow screens use tabs without dropping drafts.

## Sub-features

- `shell-open` opens a notebook with optional `?sourceId=`.
- `shell-select` focuses a source from the left list and updates the URL.
- `shell-summarize` / `shell-ask` run from the center pane.
- `shell-memo` edits `ソースのメモ` with debounce/blur save and save-state text.
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
- **Select.** Click a source name in `getByRole('complementary', { name: 'ソース一覧' })` (URL sources are external links that also focus; paste/PDF without URL are buttons). URL search includes that `sourceId`.
- **Citations.** After summarize (mock or live), summary text ends with `[1]` footnote buttons. Hover or focus `getByRole('button', { name: '引用1' })` and expect a tooltip with the excerpt. There is no separate `引用` region.
- **Memo.** Fill `getByRole('textbox', { name: 'ソースのメモ' })`, blur or wait for `保存済み`. Reload. Memo remains.
- **Ask.** Fill `getByRole('textbox', { name: '質問' })`, click `質問する`.
- **Mobile tabs.** Set viewport under `lg`, use tablist `ノートの表示切替`, switch tabs, confirm ask draft / memo draft still present.
- **Proof.** Screenshots under `$VERIFY_EVIDENCE_DIR/note-shell/`.

## Gotchas

- Summarize/ask need a non-empty stored body. Paste first.
- In-flight jobs block source delete. Wait for terminal status or use paste-only sources for delete proofs.
- Panes stay mounted when using CSS `hidden` on mobile tabs so drafts survive. Do not remount via full navigation when only switching tabs.
- Tag/move UI is gone. Do not look for notebook/tag comboboxes on this page.
