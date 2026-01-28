#!/bin/bash
# Pre-commit hook for Rust code

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🦀 Running Rust pre-commit checks..."
echo ""

# Check if we're in a Rust project directory
if [ ! -f "$PROJECT_ROOT/wasm/Cargo.toml" ]; then
    echo "⚠️  Not in a Rust project directory, skipping Rust checks"
    exit 0
fi

cd "$PROJECT_ROOT/wasm"

# Run rustfmt check
echo "📝 Checking code formatting..."
if ! cargo fmt --all -- --check; then
    echo ""
    echo "❌ Code is not formatted. Run 'make fmt' to format."
    echo "   Or run: cd wasm && cargo fmt"
    exit 1
fi
echo "✅ Code is properly formatted"

# Run clippy
echo ""
echo "🔍 Running Clippy lints..."
if ! cargo clippy --all-targets --all-features -- -D warnings; then
    echo ""
    echo "❌ Clippy found issues. Please fix them before committing."
    echo "   Run: cd wasm && cargo clippy --fix"
    exit 1
fi
echo "✅ No Clippy warnings"

# Run tests (optional, can be slow)
# Uncomment if you want to run tests on every commit
# echo ""
# echo "🧪 Running tests..."
# if ! cargo test --quiet; then
#     echo ""
#     echo "❌ Tests failed. Please fix them before committing."
#     exit 1
# fi
# echo "✅ All tests passed"

echo ""
echo "✅ Rust pre-commit checks passed!"
