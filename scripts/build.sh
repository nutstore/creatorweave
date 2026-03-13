#!/bin/bash
# Build all project components

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔨 Building CreatorWeave..."
echo ""

# Build WASM module
echo "📦 Building WASM module..."
cd "$PROJECT_ROOT/wasm"
if [ -f "scripts/build-wasm.sh" ]; then
    bash scripts/build-wasm.sh
else
    echo "❌ WASM build script not found"
    exit 1
fi

# Build frontend
echo "📦 Building frontend..."
cd "$PROJECT_ROOT/web"
pnpm run build

echo ""
echo "✅ Build completed successfully!"
echo "📂 Output: $PROJECT_ROOT/web/dist/"
echo ""
echo "To preview the build:"
echo "  cd web && pnpm run preview"
