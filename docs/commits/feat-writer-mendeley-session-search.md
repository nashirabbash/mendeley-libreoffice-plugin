# Connect Writer Sidebar to Mendeley Sessions and Search

## Change
- Reused existing Mendeley account, OAuth, and document search endpoints from Writer's native sidebar controls.
- Added single-use OAuth state validation and a Writer-specific owner-only token file; logout clears Writer's token without clearing ONLYOFFICE's shared session.
- Bundled loopback OAuth routes with the Writer extension and kept API calls off LibreOffice's UI thread.

## Verification
- Each `tests/*.test.js` assertion script ran with Node; `python3 -m unittest discover -s tests` passed 12 tests. Node/Python syntax, XML parsing, and `bash -n packaging/libreoffice/build-oxt.sh` passed.
- Throwaway stubbed-UNO smoke covered panel construction, reference rendering, and 401 return to login. LibreOffice, `soffice`, and `unopkg` are unavailable; visual Writer and packaged `.oxt` runtime checks could not run.
