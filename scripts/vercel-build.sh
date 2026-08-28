#!/bin/bash
# Vercel Build Script

set -e

echo "=== Vercel Build Script ==="
echo "Node version: $(node --version)"

# Build frontend
echo "Building frontend..."
cd web

# Install dependencies
pnpm install

# Build the Next runtime application. The web build also prepares
# Pyodide, docs, skill-store, browser-extension and PWA assets.
pnpm run build

echo "=== Build Complete ==="
echo "Next runtime output: web/.next"
