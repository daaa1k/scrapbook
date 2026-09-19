# Focus and landmarks

Keyboard users can see a high-contrast focus ring on every control, skip to `#main-content`, and hear a single page `h1` with pane `h2`s. Errors announce without moving focus.

## Sub-features

- `skip-link` is the first tab stop. The label is `メインコンテンツへ移動`. Activating it focuses `#main-content`.
- `home-h1` on `/` is `ノート`. The brand `Scrapbook` is a link, not a heading.
- `notebook-h1` on `/notebooks/$notebookId` is the notebook title. The `ノート名` field is absent until `名前を変更`. Missing notebooks use `ノートが見つかりません`.
- `pane-h2` labels are `ソース`, `要約・質問`, and `メモ`.
- `focus-visible` paints a 3px ring on keyboard focus for links, buttons, inputs, and tabs. Mouse click does not keep a browser-default outline.
- Theme uses `html[data-theme="light"|"dark"]` (resolved) and `html[data-theme-pref="light"|"dark"|"system"]`. The site header cycles システム / ライト / ダーク. Focus ring color is `var(--focus)` from semantic tokens.

## How to get to it (user POV)

- Open `/`. Press Tab. The skip link appears. Press Enter to land in the main landmark.
- Open a notebook. The title is the page heading. Each pane has its own heading.

## Driving it with Playwright

Preconditions:

- Doctor is green.

- **Skip.** Go to `/`. Press Tab. The focused control is `メインコンテンツへ移動`. Press Enter. `document.activeElement` is `#main-content`.
- **Home headings.** `getByRole('heading', { level: 1, name: 'ノート' })` is the only `h1`.
- **Notebook headings.** After paste-source, the notebook title is the only `h1`. Pane headings `ソース`, `要約・質問`, and `メモ` are `h2`.
- **Focus ring.** Tab to `新しいノート`. `outlineStyle` is `solid` and `outlineWidth` is `3px`.
- **Proof.** Screenshots and an accessibility snapshot under `$VERIFY_EVIDENCE_DIR/a11y-focus/`.

## Gotchas

- `#main-content` uses `tabindex="-1"` so the skip target can take focus. Do not assert it is in the tab order.
- The study pane is a `section`, not a second `main`. The page `main` lives in the root layout.
- Field errors use `role="alert"` and `aria-describedby`. Do not expect focus to move onto the alert.
