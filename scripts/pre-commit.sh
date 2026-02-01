#!/bin/bash
# Main pre-commit hook that runs both Rust and frontend checks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔬 Running pre-commit checks..."
echo ""

# Track if any check failed
FAILED=0

# Run Rust checks
if [ -f "$SCRIPT_DIR/pre-commit-rust.sh" ]; then
    if ! bash "$SCRIPT_DIR/pre-commit-rust.sh"; then
        echo ""
        echo -e "${RED}❌ Rust pre-commit checks failed${NC}"
        FAILED=1
    fi
else
    echo -e "${YELLOW}⚠️  Rust pre-commit script not found, skipping${NC}"
fi

# Run frontend checks if there are TypeScript files
if [ -d "$PROJECT_ROOT/web/src" ]; then
    echo ""
    echo "⚛️  Running frontend checks..."
    cd "$PROJECT_ROOT/web"

    # TypeScript type check
    echo "🔍 Running TypeScript type check..."
    if ! pnpm run typecheck; then
        echo ""
        echo -e "${RED}❌ TypeScript type check failed${NC}"
        FAILED=1
    fi

    # ESLint check (only for staged files)
    echo ""
    echo "🔍 Running ESLint on staged files..."
    if ! npx lint-staged; then
        echo ""
        echo -e "${RED}❌ ESLint check failed${NC}"
        FAILED=1
    fi

    # Add back any files modified by lint-staged (only tracked files)
    echo ""
    echo "📝 Adding back formatted files..."
    git add -u .
fi

# Final result
echo ""
if [ $FAILED -eq 1 ]; then
    echo -e "${RED}❌ Pre-commit checks failed. Please fix the issues above.${NC}"
    echo ""
    echo "Tips:"
    echo "  - Run 'make fmt' to format code"
    echo "  - Run 'make lint:fix' to fix ESLint issues"
    echo "  - Run 'make typecheck' to check TypeScript types"
    exit 1
fi

echo -e "${GREEN}✅ All pre-commit checks passed!${NC}"
exit 0
