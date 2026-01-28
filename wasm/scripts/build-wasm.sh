#!/bin/bash
# WASM 构建脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "🔨 Building WASM module..."

cd "$PROJECT_ROOT/wasm"

# 检查 wasm-pack 是否安装
if ! command -v wasm-pack &> /dev/null; then
    echo "❌ wasm-pack not found. Install it with:"
    echo "   cargo install wasm-pack"
    exit 1
fi

# 构建 WASM
wasm-pack build \
    --target web \
    --out-dir "$PROJECT_ROOT/web/public/wasm" \
    crates/wasm-bindings

echo "✅ WASM module built successfully!"
echo "📦 Output: $PROJECT_ROOT/web/public/wasm/"
