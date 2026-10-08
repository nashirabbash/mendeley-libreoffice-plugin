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
| **Tests** | `tests/document.test.js` and `tests/scroll.test.js` — run with Node, no test framework required. |
| **Agent docs** | `AGENTS.md`, `CODING_STANDARDS.md`, `CONTEXT.md`, `docs/adr/` for AI-assisted development. |

---

## Requirements

- **ONLYOFFICE Desktop Editors** (recommended) or Document Server
- **Mendeley account** — [mendeley.com](https://www.mendeley.com)
- **Mendeley OAuth app** — register at [dev.mendeley.com/myapps.html](https://dev.mendeley.com/myapps.html)
- **Python 3** (only for Desktop Editors loopback auth server)
- **Node.js** (only for running tests)

---

## Installation

### Option A — ONLYOFFICE Desktop Editors (Linux)

This is the recommended path for local development and personal use.

#### 1. Clone the repo

```bash
git clone https://github.com/nashirabbash/plugin-mendeley.git
```

#### 2. Symlink the plugin into ONLYOFFICE's plugin directory

```bash
PLUGIN_DIR="$HOME/.var/app/org.onlyoffice.desktopeditors/data/onlyoffice/desktopeditors/sdkjs-plugins"

# Create the plugins directory if it doesn't exist
mkdir -p "$PLUGIN_DIR"

# Symlink this repo as the plugin folder
ln -s "$(pwd)/plugin-mendeley" "$PLUGIN_DIR/nashirabbash-mendeley"
```

> If ONLYOFFICE is installed natively (not Flatpak), the path is:
> `~/.local/share/onlyoffice/desktopeditors/sdkjs-plugins/`

#### 3. Start the OAuth loopback server

The loopback server captures the Mendeley OAuth token and exposes it to the plugin on `http://127.0.0.1:8080/token`.

```bash
python3 scripts/mendeley-loopback-server.py
```

Keep this running in a terminal while using the plugin. To run it in the background:

```bash
python3 scripts/mendeley-loopback-server.py &
```

#### 4. Open ONLYOFFICE Desktop Editors

Launch the app. The Mendeley plugin appears in the **Plugins** tab of the Document Editor.

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
```

Both suites print pass/fail and exit with code 0 on success.

---

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
