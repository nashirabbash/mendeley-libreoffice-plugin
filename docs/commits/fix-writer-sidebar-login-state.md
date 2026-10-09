# fix: match Writer sidebar login state

## Change

- Show existing login prompt and authentication buttons before sign-in.
- Hide search and logout controls until authentication succeeds.
- Return to login state and clear search results on logout or HTTP 401.

## Verification

- `node` scripts and Python unit tests passed, including Writer sidebar state transitions.
- LibreOffice Flatpak 26.8.1.1 opened Writer with login controls visible and search controls hidden.
