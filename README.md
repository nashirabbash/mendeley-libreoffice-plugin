# Mendeley for ONLYOFFICE

Search your Mendeley library and add formatted citations and bibliographies to documents in ONLYOFFICE Document Editor.

![Workflow for installing the Mendeley plugin, connecting a Mendeley account, and adding references in ONLYOFFICE](docs/images/mendeley-workflow.png)


## Features

- Search references by title, author, or year.
- Browse collections, favorites, and recently added references.
- Insert in-text citations and bibliographies using citation styles such as APA, Chicago, and Harvard.
- Edit existing citations or unlink citations from a document.

## Requirements

- ONLYOFFICE Desktop Editors or a self-hosted ONLYOFFICE Document Server.
- A Mendeley account.
- A Mendeley OAuth application and its Client ID.

## Install in ONLYOFFICE Desktop Editors

Install ONLYOFFICE Desktop Editors first. Download the installer for your operating system from the [project releases](https://github.com/nashirabbash/plugin-mendeley/releases). These packages install the Mendeley plugin and its local helper; they do not install ONLYOFFICE.

### Linux

Install the matching `.deb` or `.rpm` package, then run:

```bash
mendeley-onlyoffice-setup
```

Choose your ONLYOFFICE installation when prompted. The setup installs the plugin for your user and starts the helper. The helper starts again when you next log in.

Before removing the package, run `mendeley-onlyoffice-remove` to remove the plugin, autostart entry, helper, and local token.

### Windows

Run `Mendeley-ONLYOFFICE-Setup.exe` and select your ONLYOFFICE plugin directory. The helper starts after setup and at your next sign-in.

Open ONLYOFFICE Desktop Editors and select **Plugins**. Mendeley should appear in the plugin list.

## Install in ONLYOFFICE Document Server

For a self-hosted Document Server, install the plugin in the server's `sdkjs-plugins` directory. For a typical Linux installation:

```bash
sudo cp -r plugin-mendeley /var/www/onlyoffice/documentserver/sdkjs-plugins/mendeley
```

Adjust the source and destination paths for your checkout and Document Server installation. If your server requires a specific plugin URL or configuration, add the plugin through your Document Server integration settings. The plugin GUID is `asc.{BE5CBF95-C0AD-4842-B157-AC40FEDD9441}`.

## Connect your Mendeley account

1. Create an OAuth application on [Mendeley's application page](https://dev.mendeley.com/myapps.html).
2. Set its redirect URI to the address shown on the plugin's **Config** screen. Common values:
   - Desktop Editors: `http://localhost:8080/`
   - Document Server: the HTTPS URL for the plugin's `oauth.html` page on your server.
3. Copy the application's Client ID.
4. Open Mendeley in ONLYOFFICE, select **Config**, enter the Client ID, and save.
5. Select **Login** and authorize access in the browser window. Your Mendeley library loads after authorization.

## Use the plugin

1. Place the document cursor where you want the citation.
2. Find references using search, collections, **Favorites**, or **Recently Added**.
3. Select one or more references.
4. Choose citation style and language.
5. Select **Insert citation** to add an in-text citation.
6. Select **Insert bibliography** to add the reference list at the end of the document.
7. Select the pencil icon beside a citation to edit it. Select **Unlink all** to convert citations to plain text.

## Troubleshooting

On CentOS with SELinux enabled, the server may block plugin files after installation. Restore the security context and restart the Document Server document service:

```bash
sudo restorecon -Rv /var/www/onlyoffice/documentserver/sdkjs-plugins/
sudo supervisorctl restart ds:docservice
```

If Mendeley login reports that port `127.0.0.1:8080` is in use, another application is using the port required by the local helper.

## Open source

This project is a fork of [ONLYOFFICE/plugin-mendeley](https://github.com/ONLYOFFICE/plugin-mendeley). It is distributed under the [Apache License 2.0](LICENSE).

Bug reports and contributions are welcome through the repository's [issue tracker](https://github.com/nashirabbash/plugin-mendeley/issues).
