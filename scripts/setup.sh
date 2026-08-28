#!/bin/bash
# Development setup script
# Sets up the development environment for the first time

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 CreatorWeave - Development Setup"
echo ""
echo "This script will set up your development environment."
echo ""

# Check Node.js installation
echo "📦 Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "   Please install Node.js from: https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js $(node --version)"

# Install pnpm dependencies
echo "📦 Installing pnpm dependencies..."
cd "$PROJECT_ROOT/web"
if [ ! -d "node_modules" ]; then
    pnpm install
    echo "✅ pnpm dependencies installed"
else
    echo "✅ pnpm dependencies already installed"
fi

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
echo "📚 For more information, see: docs/en/developer/setup.md"
