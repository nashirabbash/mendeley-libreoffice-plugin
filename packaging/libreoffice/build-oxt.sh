#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NODE_BIN="${NODE_BIN:?Set NODE_BIN to verified Node.js 22.20.0 linux-x64 binary}"
NODE_LICENSE="${NODE_LICENSE:?Set NODE_LICENSE to Node.js LICENSE file}"
OUTPUT="${1:-$ROOT/dist/mendeley-writer-linux-x86_64.oxt}"

if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 || ! -x "$NODE_BIN" || ! -f "$NODE_LICENSE" ]]; then
    printf 'Build requires Linux x86_64 and verified Node.js binary/license inputs.\n' >&2
    exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
cp -R "$ROOT/writer/." "$temp_dir/"
install -m 0644 "$ROOT/scripts/mendeley-loopback-server.py" "$temp_dir/loopback-server.py"
mkdir -p "$temp_dir/runtime/node/bin" "$temp_dir/resources"
rm -f "$temp_dir/runtime/node/bin/node"
install -m 0755 "$NODE_BIN" "$temp_dir/runtime/node/bin/node"
install -m 0644 "$NODE_LICENSE" "$temp_dir/runtime/node/LICENSE"
install -m 0644 "$ROOT/resources/light/icon.png" "$temp_dir/resources/icon.png"

python3 - "$temp_dir" "$OUTPUT" <<'PY'
from pathlib import Path
import sys
import zipfile

source = Path(sys.argv[1])
output = Path(sys.argv[2])
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as package:
    for path in sorted(source.rglob("*")):
        if not path.is_file() or "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        entry = zipfile.ZipInfo(path.relative_to(source).as_posix())
        entry.create_system = 3
        entry.external_attr = (path.stat().st_mode & 0xFFFF) << 16
        entry.compress_type = zipfile.ZIP_DEFLATED
        package.writestr(entry, path.read_bytes())
PY
