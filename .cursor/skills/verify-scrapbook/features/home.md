# Home catalog

Home is `/`. The page heading is `ノート`. Catalog loading, empty, and error are distinct states. Creating a notebook uses one `新しいノート` control.

## Sub-features

- `home-header` keeps `新しいノート` on the same row as `ノート` while the catalog has notebooks or is still loading. Site chrome also exposes the theme cycle control (`システム` / `ライト` / `ダーク`) outside the page heading row.
- `home-empty` explains that a notebook holds sources for summarize and ask, names URL / PDF / paste, and shows the only `新しいノート` control. The header does not repeat that button.
- `home-loading` shows a skeleton with `ノート一覧を読み込み中…` and never shows `ノートはまだありません`.
- `home-error` shows an alert and `再試行` when the catalog request fails. Retry refetches. Empty copy is absent.
- `home-card` opens the notebook from the card body. `削除` is outside that link. Only the row being deleted is pending (`削除しています`). Other rows keep a working `削除`. One meta line combines source count and `更新` plus a relative label.
- `home-list-controls` offers search by title, sort (`更新順` / `名前順`), and a density toggle (`標準` / `コンパクト`). Empty search shows `一致するノートはありません`.

## How to get to it (user POV)

- Open `/`. The heading is `ノート`.
- With no notebooks, read the empty copy and choose the empty-state `新しいノート`.
- With notebooks, search or sort the list, toggle density, choose a card body to open, or `削除` then confirm.
- If the list fails to load, choose `再試行`.

## Driving it with Playwright

Preconditions:

- Doctor is green at `$VERIFY_BASE_URL`.
- Run `helpers/drive.mjs home-catalog` for loading, empty-or-list, error retry, and CTA count.

- **Header.** `getByRole('heading', { level: 1, name: 'ノート' })` is present. While the list is ready or loading, `新しいノート` is in the header row. Count of `新しいノート` is 1.
- **Empty.** When there are no notebooks, the empty title is `ノートはまだありません`. The description includes `URL`, `PDF`, and `貼り付け`. `新しいノート` is inside that empty state, not also in the header.
- **Loading.** Fail or delay the catalog request, then retry. The skeleton live text is `ノート一覧を読み込み中…`. `ノートはまだありません` is absent until a successful empty catalog.
- **Error.** Abort the catalog request. An alert is visible. Click `再試行`. After a successful refetch the alert is gone.
- **Card.** A notebook card is one link named with the notebook title. There is no `開く` link. `削除` is a separate button. The card shows `更新`.
- **Proof.** Screenshots and an accessibility snapshot under `$VERIFY_EVIDENCE_DIR/home/`.

## Gotchas

- The home route loader swallows a catalog failure so the page can render the error and `再試行`. A thrown loader would hide that UI.
- Missing catalog data is loading or error, never empty. Empty is a successful `[]`.
- Local D1 often already has notebooks. `home-catalog` proves empty by writing `{ notebooks: [] }` into the page QueryClient, then proves error by aborting the decoded `_serverFn` GET for `getOrganizationCatalog`.
- Delete confirm is the P1.3 alertdialog. Scope `削除` to the card or the dialog. Only that card shows `削除しています`.
- `helpers/drive.mjs paste-source` and friends still open `新しいノート`. They use `.first()` and assume exactly one of that name.
