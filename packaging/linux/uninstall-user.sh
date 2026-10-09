#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(readlink -f "$0")"
PACKAGE_ROOT="$(cd "$(dirname "$SCRIPT_PATH")/../.." && pwd)"
HELPER="$PACKAGE_ROOT/bin/mendeley-loopback-server"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
CONFIG_DIR="$CONFIG_HOME/mendeley-onlyoffice"
[[ ! -x "$HELPER" ]] || "$HELPER" --stop
AUTOSTART="$CONFIG_HOME/autostart/mendeley-loopback.desktop"
TOKEN_FILE="$CONFIG_DIR/active-token.json"

if [[ -f "$CONFIG_DIR/install-path" ]]; then
    IFS= read -r plugin_dir < "$CONFIG_DIR/install-path"
    if [[ "$plugin_dir" == */sdkjs-plugins/mendeley ]]; then
        rm -rf -- "$plugin_dir"
    fi
fi
rm -f -- "$AUTOSTART" "$TOKEN_FILE" "$CONFIG_DIR/install-path"
rmdir "$CONFIG_DIR" 2>/dev/null || true
printf 'Removed Mendeley plugin, autostart entry, and local token.\n'
