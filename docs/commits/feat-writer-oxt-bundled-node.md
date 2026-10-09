# Package LibreOffice Writer Extension with Bundled Node.js

## Change
- Added Linux x86_64 `.oxt` packaging for a Writer-only Mendeley sidebar and bundled Node.js 22.20.0 runtime.
- Added newline-delimited JSON status protocol between sidebar and bundled worker; worker startup runs asynchronously and reports unavailable runtime in the panel.
- Kept component manifest, package path, and runtime lookup aligned at extension root.

## Verification
- `node tests/writer-worker.test.js`, `node --check writer/worker.js`, `python3 -m py_compile writer/sidebar.py`, XML parsing, and `bash -n packaging/libreoffice/build-oxt.sh` pass.
- Built `.oxt` with Node.js 22.20.0 after validating upstream SHA-256; archive contains executable Node.js and bundled worker responds `{"status":"ok","service":"mendeley-writer-worker"}`.
- `bun test` runs existing JavaScript assertion scripts; `python3 tests/test_loopback_server.py` passes 11 tests.
- LibreOffice installation and damaged-runtime UI scenarios could not run because `libreoffice`, `soffice`, and `unopkg` are unavailable.
