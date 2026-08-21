#!/bin/bash
# Build the EO2Weave Native Host Windows installer (7z GUI SFX).
#
# Output: installer/EO2Weave-Host-Setup-<ver>.exe - single file, double-click
# to install, no admin needed. Works on ANY host OS (macOS/Linux/Windows):
# needs only cargo + 7z + curl (the official 7z.sfx module is fetched once).
#
# Usage (from browser-extension/native-host/):
#   ./installer/build-installer.sh                # cross build + package
#   TARGET=x86_64-pc-windows-msvc ./installer/build-installer.sh
#   SKIP_BUILD=1 ./installer/build-installer.sh   # reuse existing exe
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="1.2.0"
TARGET="${TARGET:-}"
SKIP_BUILD="${SKIP_BUILD:-}"

# Default to the Windows cross target on non-Windows hosts.
if [ -z "$TARGET" ]; then
    case "$(uname -s)" in
        MINGW*|MSYS*|CYGWIN*) TARGET="" ;;
        *)                     TARGET="x86_64-pc-windows-gnu" ;;
    esac
fi

if [ -n "$TARGET" ]; then
    BIN="target/$TARGET/release/cw-native-host.exe"
else
    BIN="target/release/cw-native-host.exe"
fi

# -- Build ------------------------------------------------------------------
if [ -z "$SKIP_BUILD" ]; then
    if [ -n "$TARGET" ]; then
        cargo build --release --target "$TARGET"
    else
        cargo build --release
    fi
fi
if [ ! -f "$BIN" ]; then
    echo "Error: binary not found at $BIN" >&2
    exit 1
fi

# -- Stage -------------------------------------------------------------------
mkdir -p installer/staging
cp "$BIN" installer/staging/cw-native-host.exe
cp installer/launch.ps1 installer/staging/
cp installer/install-core.ps1 installer/staging/

# -- Package (7z SFX - works on ANY host OS) --------------------------------
SFX="$PWD/installer/7z.sfx"
CONFIG="$PWD/installer/sfx-config.txt"
OUT="$PWD/installer/EO2Weave-Host-Setup-$VERSION.exe"

if [ ! -f "$SFX" ]; then
    # One-time bootstrap: pull the official 7-Zip installer and extract the
    # GUI SFX module (7z.sfx) from it. ~1.6MB download, cached in installer/.
    echo "Fetching 7z.sfx module (one-time)..."
    TMP=$(mktemp -d)
    curl -sL --max-time 120 -o "$TMP/7z-installer.exe" https://www.7-zip.org/a/7z2409-x64.exe
    7z x -y -o"$TMP/extract" "$TMP/7z-installer.exe" 7z.sfx > /dev/null
    cp "$TMP/extract/7z.sfx" "$SFX"
    rm -rf "$TMP"
fi

cd installer/staging
7z a -t7z -mx=9 payload.7z cw-native-host.exe launch.ps1 install-core.ps1 > /dev/null
cat "$SFX" "$CONFIG" payload.7z > "$OUT"
rm payload.7z

echo ""
echo "Installer: $OUT"
ls -la "$OUT"
