#!/bin/bash
# WASM 监听模式构建脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "👀 Watching WASM module for changes..."

cd "$PROJECT_ROOT/wasm"

# 使用 wasm-pack 的监听模式
wasm-pack build \
    --dev \
    --target web \
    --out-dir "$PROJECT_ROOT/web/public/wasm" \
    crates/wasm-bindings

# 如果需要自动监听，可以使用 cargo watch
if command -v cargo-watch &> /dev/null; then
    cargo watch -s "wasm-pack build --dev --target web --out-dir $PROJECT_ROOT/web/public/wasm crates/wasm-bindings"
else
    echo "💡 For auto-rebuild, install cargo-watch:"
    echo "   cargo install cargo-watch"
fi
