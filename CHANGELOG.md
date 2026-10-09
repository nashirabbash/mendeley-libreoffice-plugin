# Change Log

## 1.0.3
- Fixed content control placeholder bug: pass `PlaceHolderText` with rendered citation text directly to `AddContentControl` (derived from ONLYOFFICE SDK `readContentControlCommonPr`), preventing default "Your text here".
- Replaced invalid `ctrl.GetRange()` calls on `ApiInlineLvlSdt` inside `callCommand` with official `InsertAndReplaceContentControls` targeting `InternalId`.
- Switched bibliography HTML updates to `SelectContentControl` + `PasteHtml`.
- Added regression test in `tests/document.test.js` asserting `PlaceHolderText` propagation.

## 1.0.2
- Deep DocumentModule introduced at Document Seam (`scripts/document.js`).
- Added OnlyOfficeAdapter and InMemoryAdapter for automated testability outside Document Server.
- Encapsulated Base64 citation metadata serialization (v3 schema) and script commands.
- Rewired `scripts/code.js` citation insertion, update, and unlink workflows to use DocumentModule.
- Added unit test suite in `tests/document.test.js`.
- Replaced all UI emojis and text arrows across menus, toolbars, and drawers with scalable SVG icons.
- Fixed infinite scroll for library and filter views (targeted scrollable `#docsWrapper` container with threshold check and native scroll events).
- Removed phantom `docsThumb` spacer div that caused empty blank space below list and resolved self-lockout in debounce timer.
- Fixed OAuth token handling: robust parameter parsing in `oauth.html`, automatic 401 session reset, eliminated duplicate startup calls, and prevented stale token lockout.
- Fixed "Insert Bibliography" detection: query both `GetAllAddinFields` and `GetAllContentControls` in ONLYOFFICE, add lazy adapter binding, and implement fallback text scanner matching Mendeley library documents.
- Switched citations to native inline Content Controls (`AddContentControl` type 2) with visible bounding block/brackets instead of Addin Field hover shading.
- Fixed bibliography rendering: wrap bibliography in block Content Control (`AddContentControl` type 1) and use `PasteHtml` to render rich typography (italics, formatting) without raw `<div class="csl-entry">` tags.

## 1.0.0
- Initial release