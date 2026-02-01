#!/bin/bash
# Start development servers

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Starting development server..."
echo ""

# Start dev server (skip WASM build for now)
echo "🌐 Starting Vite dev server..."
cd "$PROJECT_ROOT/web"
pnpm run dev
