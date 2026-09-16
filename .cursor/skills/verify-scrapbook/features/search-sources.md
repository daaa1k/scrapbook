# Search sources

Search sources lets a user filter the `/sources` list by title/body text, notebook, and tag, and see either matching cards or an empty-state message.

## Sub-features

- `search-text` filters with the `ソースを検索` field and `検索`.
- `search-notebook` restricts to one notebook via `ノートブック`.
- `search-tag` restricts to one tag via `タグ`.
- `search-empty` shows `一致するソースがありません。` when nothing matches.

## How to get to it (user POV)

- Open `/sources` (header `ソース`).
- Use the `ソース一覧` filter row: search box, notebook select, tag select, `検索`.
- Deep link with `?notebookId=` from a notebook `開く` link (initial filter).

## Driving it with Playwright

Preconditions:

- Doctor is green.
- At least one pasted source with a unique title token such as `VerifySearchToken` exists (create via paste-source first).

- **Seed.** Ensure a source titled with `VerifySearchToken` exists.
- **Match.** Go to `/sources`. Fill `getByRole('searchbox', { name: 'ソースを検索' })` or textbox with that name with `VerifySearchToken`. Click `getByRole('button', { name: '検索' })`. A list link/card shows that title.
- **Miss.** Search for `ZZZ-no-such-source-token`. The empty copy `一致するソースがありません。` appears.
- **Notebook filter.** Choose a notebook in `getByRole('combobox', { name: 'ノートブック' })` (native select) and `検索`. Only that notebook's sources list.
- **Proof.** Screenshots of match and empty states under `$VERIFY_EVIDENCE_DIR/search-sources/`. Include the filter controls in frame.

## Gotchas

- Filters apply on submit (`検索`), not on every keystroke.
- Combined filters are AND. An empty `q` means no text predicate.
- Native `<select>` accessible name is `ノートブック` / `タグ`. Prefer `selectOption` over clicking options by coordinate.
- List titles may show URL or id when title is null. Prefer pasted sources with explicit titles for assertions.
