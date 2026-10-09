# fix: open Writer web sign-in reliably

## Cause

- LibreOffice UNO `AsyncCallback` could not marshal the Python tuple/dictionary payload, so browser launch status and OAuth token result never reached the sidebar.
- The active loopback helper was an older process without Writer OAuth routes and returned 404 for `/writer/state`.

## Change

- Serialize callback payloads as JSON strings and decode them in `PanelCallback`.
- Launch OAuth and start token polling without waiting for a UNO callback; keep Writer's single-use state and private token endpoint.
- Restart the installed loopback helper after Linux installer updates.

## Verification

- All JavaScript assertion scripts passed; Python unittest discovery passed 13 tests.
- `bash -n` for installers, `node --check writer/worker.js`, and `python3 -m py_compile writer/sidebar.py` passed.
- LibreOffice Flatpak 26.8.1.1 smoke: Writer Web Login opened OAuth, loopback accepted callback, and sidebar showed Connected/search controls.
