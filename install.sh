#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_GUID="{BE5CBF95-C0AD-4842-B157-AC40FEDD9441}"

echo "=========================================================="
echo "  Mendeley ONLYOFFICE Auto-Connect Installer (Linux)      "
echo "=========================================================="

# 1. Pasang helper binary
mkdir -p "$HOME/.local/bin"
cp -f "$SCRIPT_DIR/scripts/mendeley-loopback-server.py" "$HOME/.local/bin/mendeley-loopback-server"
chmod +x "$HOME/.local/bin/mendeley-loopback-server"
echo "✓ Helper binary terpasang di: $HOME/.local/bin/mendeley-loopback-server"

# 2. Pasang systemd user service & autostart
mkdir -p "$HOME/.config/systemd/user" "$HOME/.config/autostart"
cat > "$HOME/.config/systemd/user/mendeley-loopback.service" <<EOF
[Unit]
Description=Mendeley ONLYOFFICE Loopback Helper
After=network.target

[Service]
Type=simple
ExecStart=$HOME/.local/bin/mendeley-loopback-server
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF

cat > "$HOME/.config/autostart/mendeley-loopback.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Mendeley ONLYOFFICE Helper
Exec=$HOME/.local/bin/mendeley-loopback-server
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF
chmod 600 "$HOME/.config/autostart/mendeley-loopback.desktop"

# Jalankan service sekarang
if command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload 2>/dev/null || true
    systemctl --user enable --now mendeley-loopback.service 2>/dev/null || true
fi

# Fallback jika systemd user tidak aktif di sesi saat ini
if ! pgrep -f "mendeley-loopback-server" >/dev/null 2>&1; then
    "$HOME/.local/bin/mendeley-loopback-server" >/dev/null 2>&1 &
fi
echo "✓ Helper service aktif di background (port 8080)"

# 3. Cari dan pasang plugin ke direktori ONLYOFFICE
INSTALLED_COUNT=0
TARGETS=(
    "$HOME/.var/app/org.onlyoffice.desktopeditors/data/onlyoffice/desktopeditors/sdkjs-plugins"
    "$HOME/.local/share/onlyoffice/desktopeditors/sdkjs-plugins"
    "$HOME/snap/onlyoffice-desktopeditors/current/.local/share/onlyoffice/desktopeditors/sdkjs-plugins"
)

for target in "${TARGETS[@]}"; do
    parent_dir="$(dirname "$target")"
    if [[ -d "$parent_dir" ]] || [[ -d "$target" ]]; then
        mkdir -p "$target/$PLUGIN_GUID"
        cp -rf "$SCRIPT_DIR/config.json" "$SCRIPT_DIR/index.html" "$SCRIPT_DIR/oauth.html" \
               "$SCRIPT_DIR/scripts" "$SCRIPT_DIR/resources" "$SCRIPT_DIR/translations" \
               "$SCRIPT_DIR/vendor" "$SCRIPT_DIR/licenses" \
               "$target/$PLUGIN_GUID/"
        ln -sfn "$PLUGIN_GUID" "$target/mendeley" 2>/dev/null || true
        echo "✓ Plugin terpasang di: $target/$PLUGIN_GUID"
        INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
    fi
done

if ((INSTALLED_COUNT == 0)); then
    DEFAULT_TARGET="$HOME/.local/share/onlyoffice/desktopeditors/sdkjs-plugins/$PLUGIN_GUID"
    mkdir -p "$DEFAULT_TARGET"
    cp -rf "$SCRIPT_DIR/config.json" "$SCRIPT_DIR/index.html" "$SCRIPT_DIR/oauth.html" \
           "$SCRIPT_DIR/scripts" "$SCRIPT_DIR/resources" "$SCRIPT_DIR/translations" \
           "$SCRIPT_DIR/vendor" "$SCRIPT_DIR/licenses" \
           "$DEFAULT_TARGET/"
    echo "✓ Plugin terpasang di default path: $DEFAULT_TARGET"
fi

echo "=========================================================="
echo "  Instalasi selesai!                                      "
echo "  Silakan buka ONLYOFFICE Desktop Editors dan Mendeley    "
echo "  akan langsung terkoneksi secara otomatis.               "
echo "=========================================================="
