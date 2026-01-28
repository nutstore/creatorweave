#!/bin/bash
# Clean build artifacts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🧹 Cleaning build artifacts..."
echo ""

# Clean Rust
echo "🦀 Cleaning Rust artifacts..."
cd "$PROJECT_ROOT/wasm"
cargo clean
rm -rf pkg/

# Clean frontend
echo "⚛️  Cleaning frontend artifacts..."
cd "$PROJECT_ROOT/web"
rm -rf dist node_modules/.vite

echo "✅ Clean completed!"
