#!/bin/bash
# Run all tests

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🧪 Running tests..."
echo ""

# Rust tests
echo "🦀 Running Rust tests..."
cd "$PROJECT_ROOT/wasm/crates/core"
cargo test

echo ""
echo "⚛️  Running frontend tests..."
cd "$PROJECT_ROOT/web"
npm test

echo ""
echo "✅ All tests passed!"
