# ONLYOFFICE Mendeley Plugin

> Fork of [ONLYOFFICE/plugin-mendeley](https://github.com/ONLYOFFICE/plugin-mendeley) — extended with a Document seam, auth hardening, infinite scroll fix, and a unit-testable architecture.

Mendeley plugin lets users search their Mendeley library and insert formatted citations and bibliographies directly into ONLYOFFICE Document Editor.

---

## What's different from upstream

| Area | Change |
|---|---|
| **Document seam** | `scripts/document.js` — deep module wrapping all ONLYOFFICE content-control operations behind a clean interface. Enables unit tests without a live Document Server. |
| **Auth** | Robust OAuth callback (`oauth.html`), stale-token cleared on new login, automatic session reset on 401, unified startup with no duplicate API calls. |
| **Infinite scroll** | Targets the real scrollable `#docsWrapper` container with a threshold check and native `scroll` events. Removes the phantom spacer div that caused blank space below the list. |
| **UI** | All emojis and text arrows replaced with scalable SVG icons across menus, toolbars, and drawers. |
| **Tests** | Node.js suites cover document behavior, scroll thresholds, and multi-page reference loading. |
| **Agent docs** | `AGENTS.md`, `CODING_STANDARDS.md`, `CONTEXT.md`, `docs/adr/` for AI-assisted development. |

---

## Requirements

- **ONLYOFFICE Desktop Editors** (recommended) or Document Server
- **Mendeley account** — [mendeley.com](https://www.mendeley.com)
- **Mendeley OAuth app** — register at [dev.mendeley.com/myapps.html](https://dev.mendeley.com/myapps.html)
- **Node.js** (only for running tests)

---

## Installation

### Option A — ONLYOFFICE Desktop Editors

Install ONLYOFFICE Desktop Editors first. These packages add the Mendeley plugin and helper; they do not install or replace ONLYOFFICE.

#### Linux

Install the matching `.deb` or `.rpm` package for Linux x64 or ARM64. Then run:

```bash
mendeley-onlyoffice-setup
```

Choose the ONLYOFFICE installation shown. Setup copies the plugin into that user's plugin directory, adds a per-user XDG Autostart entry, and starts helper immediately. It starts again at next login; no Python install or manual server command is needed.

Run `mendeley-onlyoffice-remove` before removing the package to delete the selected plugin, autostart entry, running helper, and local token.

#### Windows

Run `Mendeley-ONLYOFFICE-Setup.exe`, choose the ONLYOFFICE plugin directory, and finish setup. The helper starts immediately and at user login through `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`.

#### Launch ONLYOFFICE

Open existing ONLYOFFICE Desktop Editors. Mendeley appears in the **Plugins** tab. Installers target x64 and ARM64. OAuth keeps fixed `127.0.0.1:8080`; an existing Mendeley helper is reused. If another application owns the port, login reports conflict.


---

### Option B — ONLYOFFICE Document Server (self-hosted)

#### 1. Copy plugin files to the server

```bash
# Linux (adjust path for your Document Server version)
sudo cp -r plugin-mendeley /var/www/onlyoffice/documentserver/sdkjs-plugins/
```

No service restart required.

#### 2. (Alternative) Add via Document Server config

```js
var docEditor = new DocsAPI.DocEditor("placeholder", {
    editorConfig: {
        plugins: {
            autostart: [
                "asc.{BE5CBF95-C0AD-4842-B157-AC40FEDD9441}"
            ],
            pluginsData: [
                "https://example.com/path/to/plugin-mendeley/config.json"
            ]
        }
    }
});
```

---

## Mendeley App Configuration

The plugin requires a registered Mendeley OAuth application.

1. Go to [dev.mendeley.com/myapps.html](https://dev.mendeley.com/myapps.html) and create a new app.

2. Set the **Redirect URI** to the URL shown in the plugin's Config screen:
   - Desktop Editors: `http://localhost:8080/`
   - Document Server: `https://your-server/path/to/oauth.html`

3. Copy your **Client ID** (App ID).

4. Open the plugin, go to the **Config** tab, paste the Client ID, and save.

5. Click **Login** — a browser window opens for Mendeley OAuth. After authorising, the plugin loads your library automatically.

---

## How to use

1. **Search** your Mendeley library by title, author, or year using the search bar.

2. **Filter** by collection using the drawer on the left, or switch to **Favorites** or **Recently Added**.

3. **Select** one or more references by checking the checkboxes.

4. **Choose** a citation style (e.g. APA, Chicago, Harvard) and language from the dropdowns.

5. Click **Insert citation** — the formatted in-text citation is inserted at the cursor position.

6. Click **Insert bibliography** to add the full reference list at the end of the document.

7. To edit an existing citation, click its **pencil icon** in the sidebar.

8. To remove all citations and convert them to plain text, click **Unlink all**.

---

## Running tests

No test framework needed — plain Node.js:

```bash
node tests/document.test.js
node tests/scroll.test.js
node tests/library-pagination.test.js
```

All suites print pass/fail and exit with code 0 on success.


## Project structure

```
plugin-mendeley/
├── config.json               # Plugin manifest (GUID, name, version)
├── index.html                # Plugin UI entry point
├── oauth.html                # OAuth implicit-flow callback page
├── scripts/
│   ├── code.js               # Main plugin logic (auth, library, citations)
│   ├── document.js           # Document seam module (testable, no runtime dep)
│   ├── citeproc/             # citeproc-js citation processor
│   ├── mendeley-sdk/         # Mendeley JS SDK
│   └── thirdparty/           # fetch, promise, URL polyfills
├── tests/
│   ├── document.test.js      # Unit tests for DocumentModule + InMemoryAdapter
│   ├── library-pagination.test.js # Multi-page reference loading through scroll
│   └── scroll.test.js        # Unit tests for infinite scroll logic
├── resources/
│   ├── css/plugin_style.css
│   └── img/ light/ dark/     # Icons
├── translations/             # i18n JSON files
├── vendor/v1/                # Vendored ONLYOFFICE plugin UI assets
├── docs/adr/                 # Architecture Decision Records
├── AGENTS.md                 # Rules for AI agents working in this repo
├── CODING_STANDARDS.md       # Coding conventions
└── CONTEXT.md                # Domain glossary
```

---

## Known issues

**CentOS with SELinux enabled** — after copying to `sdkjs-plugins`, plugins may fail due to file security context. Fix:

```bash
sudo restorecon -Rv /var/www/onlyoffice/documentserver/sdkjs-plugins/
sudo supervisorctl restart ds:docservice
```

---

## Upstream

This repo is a fork of [ONLYOFFICE/plugin-mendeley](https://github.com/ONLYOFFICE/plugin-mendeley).  
To pull upstream changes:

```bash
git fetch upstream
git merge upstream/master
```

---

## License

Apache 2.0 — see [LICENSE](LICENSE).
