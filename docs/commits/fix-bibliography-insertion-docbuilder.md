# Fix Bibliography Insertion via DocumentBuilder API

## Problem
Inserting a bibliography created an empty Content Control in ONLYOFFICE. `SelectContentControl(internalId)` selected the bounding box container rather than focusing within the control, causing subsequent `PasteHtml` calls to fail and leave the Content Control blank.

## Solution
1. Created `scripts/docbuilder-helper.js` (197 lines) to parse CSL HTML entries into paragraphs and runs with rich text formatting (`oRun.SetItalic(true)`, `oRun.SetBold(true)`), XML entity decoding, dynamic hanging indents, and plain text fallback.
2. Updated `scripts/document.js` to populate bibliography Content Controls via `InsertAndReplaceContentControls` with DocumentBuilder scripts instead of fragile cursor selection and `PasteHtml`.
3. Updated `scripts/citation-sync.js` and `scripts/citation-insert.js` to extract CSL style `hangingindent` parameters and pass options for dynamic hanging indents.
4. Ensured automatic in-place replacement of existing `MENDELEY_BIBLIOGRAPHY` blocks.
5. Added unit test suite in `tests/docbuilder.test.js` and updated `tests/document.test.js` and `tests/modules.test.js`.

## Verification
- `bun test` / `node tests/*.test.js`: All 4 test suites passing (scroll, modules, document, docbuilder).
- Code review sub-agents (Standards and Spec) passed with 0 findings.
