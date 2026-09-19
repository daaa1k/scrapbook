# Add a source

Add-source is the dialog behind `新しいノート` and `ソースを追加`. The user picks one input method (URL, PDF, or paste) and only that form is shown.

## Sub-features

- `source-add-open` opens the dialog from home「新しいノート」or notebook「ソースを追加」. Focus lands on the first field of the selected method (`ページのURL` for the default URL tab).
- `source-add-method` is a tablist named `入力方法`. ArrowLeft, ArrowRight, Home, and End move the selection with roving `tabindex`. Unselected panels use `hidden`, `aria-hidden`, and `inert`. Only the selected method's fields are visible.
- `source-add-submit` shows `登録中…` and a spinner on the pressed submit button. The dialog is `aria-busy`. Copy `登録中はキャンセルできません。` is visible. Esc, backdrop, and `閉じる` do nothing until the request finishes.
- `source-add-discard` closes immediately when every field is empty. Typed input opens alertdialog `入力を破棄しますか？`. `キャンセル` keeps the dialog. `破棄する` closes it and restores focus to the opener.
- `source-add-reset` clears drafts after a successful register so the next open is empty.

## How to get to it (user POV)

- On `/`, choose `新しいノート`, or on a notebook choose `ソースを追加`.
- Pick `URL`, `PDF`, or `貼り付け`. Fill that method only.
- Close with the icon named `閉じる` (not a primary button). Empty closes. Dirty asks to discard.

## Driving it with Playwright

Preconditions:

- Doctor is green.

- **One form.** Open the dialog. `getByRole('tablist', { name: '入力方法' })` is visible. The URL textbox `ページのURL` is visible. `タイトル` and `PDFファイル` are not visible. Click tab `貼り付け`. `タイトル` is visible. `ページのURL` is not.
- **Cancel empty.** Click `閉じる`. No alertdialog. No new notebook card.
- **Discard.** Type into `ページのURL`. Click `閉じる`. Alertdialog `入力を破棄しますか？`. Click `キャンセル`. The URL value remains. Click `閉じる` then `破棄する`. Focus returns to `新しいノート`.
- **Paste create.** `helpers/drive.mjs paste-source` clicks `貼り付け` then saves.
- **URL create.** `helpers/drive.mjs url-source --url https://example.com/verify-$VERIFY_RUN_ID`.
- **PDF create.** `helpers/drive.mjs pdf-source --file <pdf>`.
- **Busy.** Intercept the register request so it hangs. Click `URLを登録`. The submit name is `登録中…`. `閉じる` is disabled. The status text is `登録中はキャンセルできません。`
- **Proof.** `$VERIFY_EVIDENCE_DIR/source-add/` plus paste-source / register-url / pdf-source evidence dirs.

## Gotchas

- `閉じる` is an icon button. Query it by accessible name, not by the old primary-button placement.
- The URL field accessible name is `ページのURL`, not `URL`. The tab is still named `URL`.
- Paste fields exist in the DOM but are `hidden` until the paste tab is selected. Do not fill `タイトル` before clicking `貼り付け`.
- Nested alertdialog for discard is a sibling of the source dialog, same `ConfirmDialog` as delete. Scope `キャンセル` / `破棄する` to that alertdialog.
- Drag-and-drop PDF, clipboard URL preview, long-job staging, and a mobile fixed footer are out of this unit.
