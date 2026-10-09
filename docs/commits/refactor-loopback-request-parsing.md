# Centralize Loopback Request JSON Parsing

## Change
- Extracted bounded request-body decoding shared by Writer OAuth and existing loopback token endpoints.

## Verification
- `python3 tests/test_loopback_server.py` passed 12 tests; full JavaScript and Python suites, Node/Python syntax checks, XML parsing, and `bash -n packaging/libreoffice/build-oxt.sh` passed.
