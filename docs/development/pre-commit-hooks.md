# Pre-Commit Hooks Guide

## Overview

This project uses Git pre-commit hooks to ensure code quality before committing. The hooks automatically run linters, formatters, and type checkers on staged files.

## 🪝 What Gets Checked

### Rust Code
- ✅ **Code Formatting** - `cargo fmt` (checks if code is properly formatted)
- ✅ **Linting** - `cargo clippy` (Rust linter with all warnings enabled)
- ⏭️ **Tests** - Optional: `cargo test` (can be enabled if needed)

### Frontend Code
- ✅ **TypeScript Type Check** - `tsc --noEmit` (catches type errors)
- ✅ **ESLint** - Linting for TypeScript and React
- ✅ **Prettier** - Code formatting (auto-fixes on commit)

## 🚀 Installation

### Automatic Setup (Recommended)

Run the setup script which will install everything:

```bash
make setup
```

This will:
1. Install all dependencies
2. Set up Husky (Git hooks manager)
3. Configure lint-staged (run linters only on staged files)
4. Create pre-commit and pre-push hooks

### Manual Setup

If you prefer manual setup:

```bash
# 1. Install dependencies
cd web
npm install

# 2. Set up Husky
npm install --save-dev husky lint-staged

# 3. Initialize hooks
cd ..
npx husky init

# 4. Create pre-commit hook
cat > web/.husky/pre-commit << 'EOF'
#!/bin/bash
. "$(dirname "$0")/_/husky.sh"

cd "$(git rev-parse --show-toplevel)"
bash scripts/pre-commit.sh
EOF

chmod +x web/.husky/pre-commit
```

## 🔧 How It Works

### Pre-Commit Hook Flow

```
Git Commit Triggered
         ↓
┌─────────────────────────────────────────┐
│  Rust Checks (scripts/pre-commit-rust.sh)│
│  1. cargo fmt --check                  │
│  2. cargo clippy -D warnings           │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│  Frontend Checks (lint-staged)          │
│  1. TypeScript type check              │
│  2. ESLint on staged files              │
│  3. Prettier format staged files        │
└─────────────────────────────────────────┘
         ↓
   All Checks Passed? → Commit Proceeds
         ↓
   Failed? → Commit Blocked, Show Errors
```

### lint-staged Configuration

Located in `web/package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{css,scss}": [
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

This ensures:
- Only staged files are checked (fast)
- Auto-fixable issues are fixed automatically
- Non-fixable issues block the commit

## 📋 Available Commands

### Makefile Commands

```bash
make lint          # Run all linters (ESLint + Clippy)
make lint:fix      # Fix linting issues automatically
make format        # Format all code (Rust + TypeScript + CSS)
make typecheck     # Run TypeScript type check
make fmt           # Format Rust code
make clippy        # Run Clippy checks
```

### Manual Commands

```bash
# Rust checks
cd wasm
cargo fmt             # Format code
cargo fmt --check     # Check formatting
cargo clippy          # Run linter
cargo clippy --fix    # Fix issues automatically

# Frontend checks
cd web
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues
npm run format        # Format code
npm run typecheck     # TypeScript type check
```

## 🚫 Skipping Hooks

### Not Recommended

If you need to bypass hooks temporarily (not recommended):

```bash
# Skip pre-commit hook
git commit --no-verify -m "WIP: work in progress"

# Skip pre-push hook
git push --no-verify
```

### Why You Shouldn't Skip

- ❌ **Type Errors**: Caught by TypeScript, prevent runtime bugs
- ❌ **Linting Issues**: Code quality problems, potential bugs
- ❌ **Formatting Issues**: Inconsistent code style
- ❌ **Clippy Warnings**: Rust code quality issues, potential bugs

## 🐛 Troubleshooting

### Issue: Pre-commit hook not found

```bash
# Reinstall hooks
make setup-hooks
# or
bash scripts/setup-hooks.sh
```

### Issue: Hook permission denied

```bash
# Fix hook permissions
chmod +x web/.husky/pre-commit
chmod +x web/.husky/pre-push
chmod +x scripts/pre-commit*.sh
```

### Issue: Linter fails but you're confident

1. **Auto-fix issues**:
   ```bash
   make lint:fix
   ```

2. **Check what failed**:
   - Rust: Run `make clippy` to see Clippy warnings
   - Frontend: Run `make typecheck` to see type errors

3. **Fix issues manually**, then commit again

### Issue: Hooks are slow

If hooks are taking too long:

1. **Disable tests in pre-commit** (already disabled by default)
   - Edit `scripts/pre-commit-rust.sh`
   - Comment out the `cargo test` section

2. **Only check staged files** (already configured)
   - We use `lint-staged` to only check changed files

3. **Use partial staging**:
   ```bash
   git add file.ts      # Stage only files you're ready to commit
   git commit          # Hooks will only check staged files
   ```

## 📊 Hook Performance

Average execution time:

| Check | Time | Notes |
|-------|------|-------|
| Rust fmt check | ~0.5s | Very fast |
| Rust clippy | ~2-5s | Depends on code size |
| TypeScript typecheck | ~3-8s | Depends on project size |
| ESLint (staged files) | ~1-3s | Only checks changed files |
| Prettier (staged files) | ~1-2s | Auto-formats |
| **Total** | **~7-20s** | Acceptable for most commits |

## 🔄 CI/CD Integration

These checks can also be mirrored in CI/CD:

- **Pre-commit**: Catch issues locally before pushing
- **CI**: Double-check on remote (if workflow is configured, catches cases where hooks were bypassed)

## 💡 Best Practices

1. **Commit Often, Commit Small**
   - Fewer files to check = Faster hooks
   - Easier to fix issues

2. **Run Checks Before Committing**
   ```bash
   make lint      # Check before committing
   make typecheck # Verify types
   ```

3. **Fix Issues Automatically**
   ```bash
   make lint:fix  # Auto-fix most issues
   make format    # Format all code
   ```

4. **Read the Error Messages**
   - Clippy: Provides detailed explanations
   - ESLint: Shows rule names and documentation links
   - TypeScript: Shows exact type errors

5. **Don't Bypass Hooks**
   - Only use `--no-verify` in emergencies
   - Fix issues properly before committing

## 📚 Related Documentation

- [ESLint Configuration](../.eslintrc.json)
- [TypeScript Configuration](../tsconfig.json)
- [Prettier Configuration](../.prettierrc)
- [Rust Formatting](../rust-toolchain.toml)
- [Development Setup](./setup.md)
