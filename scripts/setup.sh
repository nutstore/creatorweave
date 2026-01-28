#!/bin/bash
# Development setup script
# Sets up the development environment for the first time

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Browser File System Analyzer - Development Setup"
echo ""
echo "This script will set up your development environment."
echo ""

# Check Rust installation
echo "📦 Checking Rust installation..."
if ! command -v rustc &> /dev/null; then
    echo "❌ Rust is not installed."
    echo "   Please install Rust from: https://rustup.rs/"
    exit 1
fi
echo "✅ Rust $(rustc --version)"

# Check Node.js installation
echo "📦 Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "   Please install Node.js from: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js $(node --version)"

# Install wasm-pack if not present
echo "📦 Checking wasm-pack..."
if ! command -v wasm-pack &> /dev/null; then
    echo "   Installing wasm-pack..."
    cargo install wasm-pack
fi
echo "✅ wasm-pack $(wasm-pack --version)"

# Add WASM target
echo "📦 Adding WASM target..."
rustup target add wasm32-unknown-unknown
echo "✅ WASM target added"

# Install npm dependencies
echo "📦 Installing npm dependencies..."
cd "$PROJECT_ROOT/web"
if [ ! -d "node_modules" ]; then
    npm install
    echo "✅ npm dependencies installed"
else
    echo "✅ npm dependencies already installed"
fi

# Create WASM output directory
echo "📦 Creating WASM output directory..."
mkdir -p "$PROJECT_ROOT/web/public/wasm"
echo "✅ Directory created"

# Install pre-commit hooks
echo ""
echo "🪝 Setting up pre-commit hooks..."
if [ -f "$SCRIPT_DIR/setup-hooks.sh" ]; then
    bash "$SCRIPT_DIR/setup-hooks.sh"
else
    echo "⚠️  Pre-commit hooks setup script not found"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "  1. Run 'make dev' to start the development server"
echo "  2. Or run 'bash scripts/dev.sh'"
echo ""
echo "🔖 Available commands:"
echo "  make dev              - Start development server"
echo "  make build            - Build all projects"
echo "  make test             - Run all tests"
echo "  make lint             - Run all linters"
echo "  make format            - Format all code"
echo "  make typecheck         - Run TypeScript type check"
echo ""
echo "📚 For more information, see: docs/development/setup.md"
