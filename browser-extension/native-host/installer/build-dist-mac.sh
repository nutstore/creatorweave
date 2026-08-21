#!/bin/bash
# Build the EO2Weave Native Host macOS distribution zip.
#
# Output: installer/EO2Weave-NativeHost-<ver>-macos.zip containing:
#   cw-native-host        (universal: aarch64 + x86_64)
#   install.sh            (user-level installer, no sudo — see install-user-mac.sh)
#   README.txt
#
# Recipients: unzip anywhere (Downloads is fine), then `bash install.sh`.
# The installer copies the binary to ~/Library/... so the zip's location
# is irrelevant afterwards.
#
# Usage (from browser-extension/native-host/, on a mac):
#   ./installer/build-dist-mac.sh               # universal build + zip
#   SKIP_BUILD=1 ./installer/build-dist-mac.sh  # reuse existing binaries
#   SKIP_LIPO=1  ./installer/build-dist-mac.sh  # single-arch native build
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${EO2WEAVE_HOST_VERSION:-1.2.0}"
BIN_NAME="cw-native-host"
SKIP_BUILD="${SKIP_BUILD:-}"
SKIP_LIPO="${SKIP_LIPO:-}"

# -- Build --------------------------------------------------------------------
if [ -z "$SKIP_BUILD" ]; then
    if [ -z "$SKIP_LIPO" ]; then
        cargo build --release --target aarch64-apple-darwin
        cargo build --release --target x86_64-apple-darwin
    else
        cargo build --release
    fi
fi

STAGING="installer/staging-mac-dist"
rm -rf "$STAGING"
mkdir -p "$STAGING"

if [ -z "$SKIP_LIPO" ]; then
    ARM="target/aarch64-apple-darwin/release/$BIN_NAME"
    X86="target/x86_64-apple-darwin/release/$BIN_NAME"
    [ -f "$ARM" ] || { echo "Error: missing $ARM" >&2; exit 1; }
    [ -f "$X86" ] || { echo "Error: missing $X86" >&2; exit 1; }
    lipo -create -output "$STAGING/$BIN_NAME" "$ARM" "$X86"
else
    NATIVE="target/release/$BIN_NAME"
    [ -f "$NATIVE" ] || { echo "Error: missing $NATIVE" >&2; exit 1; }
    cp "$NATIVE" "$STAGING/$BIN_NAME"
fi
chmod 755 "$STAGING/$BIN_NAME"
cp installer/install-user-mac.sh "$STAGING/install.sh"
chmod 755 "$STAGING/install.sh"

cat > "$STAGING/README.txt" <<'EOF'
EO2Weave Native Host (macOS)
============================

安装（无需管理员密码）：

  1. 解压本包
  2. 打开「终端」(Terminal)，cd 到解压目录，运行：

     bash install.sh

  3. 完全重启浏览器（macOS Chrome：Cmd+Q 退出再打开）

安装器会把二进制放到 ~/Library/... 稳定位置，之后本 zip 可以删除。

配合 Codex / Claude Code（安装完成后）：

  1. EO2Weave 扩展 popup → 打开「Agent 桥接（MCP）」
  2. 复制 popup 里的接入命令，或直接运行 install.sh 输出的命令

卸载：

  bash "$HOME/Library/Application Support/EO2Weave NativeHost/uninstall.sh"
EOF

# Strip quarantine before zipping (belt & braces — the installer strips it
# again at install time, this covers people who run the binary directly).
find "$STAGING" -exec xattr -d com.apple.quarantine {} \; 2>/dev/null || true
find "$STAGING" -name '._*' -type f -delete

OUT="$PWD/installer/EO2Weave-NativeHost-$VERSION-macos.zip"
rm -f "$OUT"
(cd "$STAGING" && zip -q -X "$OUT" "$BIN_NAME" install.sh README.txt)

echo ""
echo "Distribution zip: $OUT"
ls -la "$OUT"
echo ""
echo "Recipients: unzip → bash install.sh → restart browser."
