#!/bin/bash
# Setup pre-commit hooks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🪝 Setting up pre-commit hooks..."
echo ""

# Check if husky is installed in web
cd "$PROJECT_ROOT/web"
if ! npm list husky &> /dev/null; then
    echo "📦 Installing husky and lint-staged..."
    npm install --save-dev husky lint-staged
fi

# Initialize husky in web directory
echo "📦 Initializing husky..."
npx husky init

# Create pre-commit hook that runs from project root
cat > .husky/pre-commit << 'EOF'
#!/bin/bash
. "$(dirname "$0")/_/husky.sh"

cd "$(git rev-parse --show-toplevel)"
bash scripts/pre-commit.sh
EOF

chmod +x .husky/pre-commit

echo ""
echo "✅ Pre-commit hooks installed successfully!"
echo ""
echo "The following hooks are now active:"
echo "  - pre-commit: Runs Rust fmt/clippy checks, TypeScript type check, and ESLint"
echo ""
echo "To skip hooks temporarily (not recommended):"
echo "  git commit --no-verify"
