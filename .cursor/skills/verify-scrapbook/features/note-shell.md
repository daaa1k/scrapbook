# Note shell

Note shell is the `/notebooks/$notebookId` three-pane experience: sources on the left, summarize/citations/ask in the center, memo on the right. The notebook title is the page `h1`. Rename is not a permanent field. Pane titles `ソース`, `要約・質問`, and `メモ` are `h2`. Layout modes by width: phone tabs below `md` (48rem), tablet source drawer from `md` to `lg`, desktop three-pane split at `lg` (64rem). The notebook route fills the visual viewport height (`--app-height`, falling back to `100dvh`). Safe-area insets pad the shell so top and bottom chrome clear the notch and home indicator. The notebook header stays fixed. Each pane scrolls on its own.

## Sub-features

- `shell-open` opens a notebook with optional `?sourceId=`. The header breadcrumb is `ホーム / {notebook title}`. `ホーム` goes to `/`. The title is the only `h1`. There is no `ノート名` textbox until rename starts. Catalog and source-list fetches each have their own loading skeleton or `再試行`. The page does not show a single `読み込み中…` for the whole shell.
- `shell-layout` keeps the notebook chrome in `body.notebook-workspace` with height `var(--app-height, 100dvh)`, `position: fixed`, and `overflow` on the panes, not the page. Desktop columns use flexible `minmax` tracks (not fixed `280px + 320px`). Tablet shows study + memo side by side and opens sources with `ソース一覧` as a left drawer. Phone keeps the three tabs. Pane surfaces use tinted backgrounds and sticky `h2` headings, not borders alone. Notebook max width is `90rem` on this route. The root viewport meta includes `viewport-fit=cover`.
- `shell-rename` starts from `名前を変更` (ghost). The heading becomes an `ノート名` field with `保存` and `キャンセル`. `保存` writes the new title and returns to the heading. `キャンセル` or Escape restores the saved title. `ソースを追加` in the header stays `secondary`.
- `shell-select` focuses a source from the left list and updates the URL.
- `shell-ask` … On phone, `質問する` sits in a sticky footer…
- `shell-shortcuts` opens from `ショートカット` or `?` (when not typing). `J`/`K` or `]`/`[` move between sources. Ask supports ⌘/Ctrl+Enter.
- `shell-qa-undo` after confirming Q&A delete shows `元に戻す` for a few seconds before the delete commits.
- `shell-memo` edits `ソースのメモ` with debounce/blur save and save-state text. The save status stays in a sticky header. Query invalidation (summarize/ask refetch, post-save refresh) must not replace a dirty or save-error draft. Leaving the notebook (breadcrumb `ホーム`, brand `Scrapbook`, back, reload) flushes the draft; a failed flush keeps the draft and shows 再試行 / 破棄.
- `shell-mobile-tabs` switches ソース / 要約・質問 / メモ under `md`. The tablist is sticky, full width, shrink-0, and equal columns. Each tab is at least 44×44 CSS px. The selected tab uses the inverse surface token (`bg-inverse`), bold label, and a bottom indicator. Arrow keys, Home, and End move selection with roving `tabindex`. Focus stays on the selected tab. Unselected panels use the `hidden` attribute, `aria-hidden`, and `inert` together, so they leave the accessibility tree. Panes stay mounted. Orientation change keeps the selected tab and drafts (panes do not remount).
- `shell-mobile-safe-area` pads the notebook shell with `env(safe-area-inset-*)`. Interactive chrome (tabs, ask submit, memo status, memo error actions) clears the notch and home indicator.
- `shell-delete-source` deletes from the left pane after the in-app alertdialog. Open the row `操作` menu, then `削除`. After a mid-list delete, the next source at that index is selected (the previous source if it was last). Other rows keep a working `操作` control. A row with an in-flight job shows `処理中のため削除できません` in the row text, not only as a tooltip. `操作`, `削除`, external-open, and footnote `引用N` controls are at least 44×44 CSS px.
- `shell-source-row` shows a Web / PDF / `貼り付け` kind mark, a two-line title with a native tooltip, `選択中` plus `aria-current="true"` on the focused row, and a pending or failed job chip when the list item has one. Long titles and URLs wrap with `break-anywhere` instead of forcing horizontal overflow.
- `shell-empty-sources` keeps the three panes when the notebook has no sources. The left pane shows `まだソースがありません。追加すると要約と質問が使えます。` with a nearby `ソースを追加` button.
- `shell-source-controls` offers title/body search and sort (`追加順` / `更新順` / `タイトル順`) above the source list when the notebook has sources or an active search.
- `shell-invalid-source` shows `指定されたソースが見つからないため、先頭のソースを表示しています。` when `?sourceId=` is missing from the notebook.
- `shell-qa-delete` confirms with the same alertdialog as source delete. Only the turn being deleted is pending. Other `この質問と回答を削除` buttons stay enabled.

## How to get to it (user POV)

- From `/`, open a notebook, or finish first-source create.
- The header shows `ホーム / {notebook title}`. The title is a heading. `名前を変更` opens the rename field.
- Desktop (`lg+`) shows three columns. Tablet (`md`–`lg`) shows study + memo with `ソース一覧` drawer. Phone (below `md`) shows a tablist.

## Driving it with Playwright

Preconditions:

- Doctor is green.
- A notebook with at least one pasted source exists (use paste-source).
- For source-list and Q&A ops, run `helpers/drive.mjs source-list-qa`.
- For the title heading and rename, run `helpers/drive.mjs notebook-title`.

- **Open.** Navigate to the notebook URL from paste-source `meta.json` `resultUrl`. The breadcrumb name is `パンくず` and includes a `ホーム` link plus the notebook title as the current page. `getByRole('heading', { level: 1, name: <title> })` is the only `h1`. `getByRole('textbox', { name: 'ノート名' })` is absent.
- **Layout (desktop 1440).** Body does not scroll as a page. `#notebook-panel-sources`, `#notebook-panel-study`, and `#notebook-panel-memo` each have their own `overflow-y` scrollport. The notebook header (breadcrumb + title) stays visible while a pane scrolls. Three columns are present. Column tracks are not fixed `280px` / `320px`.
- **Layout (narrow ~1024).** Still three columns at `lg`. Center study pane stays usable (`minmax(0,1fr)`). No horizontal page crush that hides the study heading.
- **Layout (tablet ~820).** No tablist `ノートの表示切替`. `ソース一覧` opens a left drawer dialog for sources. Study and memo stay visible side by side.
- **Layout (phone 390).** Tablist `ノートの表示切替` is present. Selecting a tab shows one pane.
- **Mobile keyboard (phone 390).** With the study tab open, focus `質問`. Simulate a shorter visual viewport (about 480 CSS px tall). `document.documentElement` has `--app-height` near that height and `--app-keyboard-inset` greater than 0. `質問する` remains inside the visual viewport (`getBoundingClientRect().bottom` ≤ visualViewport height). Switch to `メモ`, focus `ソースのメモ`, and confirm the sticky `保存中` / `保存済み` / `未保存` status stays in view at the top of the memo pane.
- **Safe area.** The notebook shell padding uses `env(safe-area-inset-*)` (and `viewport-fit=cover` in the root meta). Computed `padding-top` / `padding-bottom` on the shell flex column is at least `0.75rem`, and larger when the browser reports non-zero safe-area insets.
- **Tap targets.** Footnote `引用1`, source external-open, row `操作`, menu `削除`, and Q&A `この質問と回答を削除` each measure at least 44×44 CSS px.
- **Wrap.** A long URL title and a long Japanese question wrap inside the pane width. `document.documentElement.scrollWidth` stays equal to `clientWidth` at 390 CSS px.
- **Rename.** Click `名前を変更`. The `ノート名` textbox appears and the visible heading is gone. Fill a new title. Click `キャンセル` or press Escape. The saved `h1` returns and the textbox is gone. Click `名前を変更` again, fill a new title, click `保存`. The `h1` shows the new title. There is still no `ノート名` textbox.
- **Select.** Click the source title button inside `#notebook-panel-sources`. That button only focuses the source (`?sourceId=`). Under `md` it also switches to the study tab, moves focus to `notebook-tab-study`, and announces `{title}を選び、要約・質問を表示しています` in a `role="status"` live region. The sources pane keeps `ソースを選ぶと要約・質問タブに切り替わります` as `sr-only` for `aria-describedby` (not visible muted chrome). When the source has a URL, a separate link named `{title}を新しいタブで開く` opens the URL in a new tab and must not change selection. Rows without a URL have the select button only.
- **Citations.** After summarize (mock or live), summary text ends with `[1]` footnote buttons (`getByRole('button', { name: '引用1' })`). Click toggles an in-flow excerpt panel under the paragraph (`aria-expanded`). There is no floating tooltip and no separate `引用` region.
- **Memo.** Fill `getByRole('textbox', { name: 'ソースのメモ' })`, blur or wait for `保存済み`. Reload. Memo remains. While a summarize job is in progress (detail refetch every 2s), type more text and confirm the textarea keeps it. Click breadcrumb `ホーム` or brand `Scrapbook` with a dirty memo. The draft saves and the home list appears. If save is failed (error on the pane), the same navigation keeps the draft and shows alertdialog `メモを保存できませんでした` with `再試行` and `破棄`. `破棄` restores the last saved memo and continues navigation.
- **Ask.** Fill `getByRole('textbox', { name: '質問' })`, click `質問する`. The new turn shows `回答を準備しています` or `回答しています` until the answer arrives. A failed empty answer shows `回答できませんでした`.
- **Delete source.** In `#notebook-panel-sources`, click `{title}の操作`, then the `削除` menuitem. An alertdialog opens with initial focus on `キャンセル`. Esc or `キャンセル` leaves the source. `削除` in the dialog removes it. After deleting a middle row, the URL `sourceId` is the next listed source, not the first. A busy row shows `処理中のため削除できません` next to the row. That row's menuitem is disabled. Other rows' `操作` buttons stay enabled.
- **Selected row.** The focused source title is bold, includes a visible `選択中` label, and `aria-current="true"`. Kind text `貼り付け`, `Web`, or `PDF` is visible on the row. The title uses a two-line clamp and a `title` tooltip.
- **Empty sources.** A notebook with no sources still has the sources pane. It contains `まだソースがありません` and `ソースを追加`.
- **Invalid sourceId.** Open `/notebooks/$id?sourceId=missing-source`. The sources pane alert is `指定されたソースが見つからないため、先頭のソースを表示しています。`
- **Delete Q&A.** In the study pane, click `この質問と回答を削除`. The alertdialog title is `この質問と回答を削除します`. Cancel leaves the turn. Confirm removes it. A second turn's delete button stays enabled while the dialog is open.
- **Mobile tabs.** Set the viewport under `md` (390×844 is enough). The tablist name is `ノートの表示切替`. Each tab is `min-height` 44 CSS px or taller and one third of the tablist width. The selected tab is `aria-selected=true` and `tabindex=0`. The others are `aria-selected=false` and `tabindex=-1`. Focus a tab, then press ArrowRight, ArrowLeft, Home, and End. Selection follows the key. `document.activeElement` stays on the selected tab, not the pane `h2`. The selected panel has no `hidden` attribute. Each other panel has `hidden`, `aria-hidden="true"`, and `inert`. An accessibility snapshot of the notebook must not list the unselected pane headings. Fill `質問`, switch to `メモ`, fill `ソースのメモ`, switch back. Both drafts are still there. Scroll a pane. The tablist stays visible (shrink-0 above the pane scrollports). Rotate or resize between 390×844 and 844×390. The selected tab and both drafts remain.
- **Proof.** Screenshots under `$VERIFY_EVIDENCE_DIR/note-shell/`.

## Gotchas

- Summarize/ask need a non-empty stored body. Paste first. Local mock ask can stick on `結果を保存しています` and then fail `ingest_failed`. `helpers/drive.mjs source-list-qa` finishes that job in local D1 so Q&A delete can run. The busy-row reason is checked while the ask job is still in flight.
- In-flight jobs block source delete. Wait for terminal status or use paste-only sources for delete proofs. The busy reason is visible row text (`処理中のため削除できません`), not a `title` tooltip only. Open `{title}の操作` to see the disabled `削除` menuitem.
- Source delete and Q&A delete both confirm in an in-app alertdialog, not `window.confirm`. Scope `キャンセル` / `削除` to that dialog. The leave-save alertdialog is a different one. Source delete is inside the row `操作` menu. Q&A delete is `この質問と回答を削除` on that turn.
- Panes stay mounted on tab switch. Tabs layout sets the HTML `hidden` attribute, `aria-hidden`, and `inert` on unselected panels. CSS `hidden` still covers the first paint before `matchMedia` hydrates to drawer or split. Do not remount via full navigation when only switching tabs. Do not move focus to a pane heading after a tab key. HTML `hidden` uses `display: none !important` in Chromium, so do not leave that attribute set in split layout or the desktop three-pane layout disappears. Tablet drawer uses `role="dialog"` for `#notebook-panel-sources` and keeps study + memo mounted.
- Tag/move UI is gone. Do not look for notebook/tag comboboxes on this page.
- The leave alertdialog is in the notebook header, not the memo pane, so it stays on screen when the memo tab is CSS-hidden. Reload or tab close with a dirty or failed memo uses the browser `beforeunload` dialog, not the in-app alertdialog. Scope `再試行` / `破棄` to the alertdialog when both the pane error row and the leave dialog are visible.
- The notebook title is an `h1` until `名前を変更`. Do not expect a permanent `ノート名` field. `保存` and `キャンセル` exist only in edit mode. Breadcrumb `ホーム` replaced `← ホームへ`. Scope header `キャンセル` to the rename form when a confirm dialog is also open.
- Phone tabs are below `md` (48rem), not `lg`. Tablet (`md`–`lg`) is drawer mode. Desktop split starts at `lg` (64rem).
