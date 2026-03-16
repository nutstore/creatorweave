#!/bin/bash
# Vercel Build Script - Includes WASM compilation
# Vercel automatically sets VERCEL=1 environment variable

set -e

echo "=== Vercel Build Script ==="
echo "Node version: $(node --version)"
echo "Working directory: $(pwd)"

# Install Rust if not present
if ! command -v rustc &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

echo "Rust version: $(rustc --version)"

# Add wasm32-unknown-unknown target
echo "Adding WASM target..."
rustup target add wasm32-unknown-unknown

# Install wasm-pack if not present
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

echo "wasm-pack version: $(wasm-pack --version)"

# Build WASM
echo "Building WASM..."
cd wasm
bash scripts/build-wasm.sh
cd ..

# Build frontend
echo "Building frontend..."
cd web

# Install dependencies
pnpm install

# Build with Vite
pnpm exec vite build

# Copy Pyodide
echo "Copying Pyodide..."
mkdir -p dist/assets/pyodide
cp -r node_modules/pyodide/* dist/assets/pyodide/

echo "=== Build Complete ==="
echo "Output directory: web/dist"
ls -la dist/
