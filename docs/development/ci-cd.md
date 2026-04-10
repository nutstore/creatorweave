# CI/CD Guide

## Overview

This repository currently relies on local quality gates (pre-commit + manual checks).

At the moment, no CI workflow file is tracked under `.github/workflows/`.
If you want remote quality gates on PR/push, add a workflow file first.

## 🔄 CI Pipeline

### Current Status

- Local checks are the source of truth.
- Suggested command set before push:
  - `pnpm -C web run typecheck`
  - `pnpm -C web run lint`
  - `pnpm -C web run test:run` (or targeted test commands)
  - `pnpm -C mobile-web run typecheck`
  - `pnpm -C relay-server run typecheck`
  - `cargo -C wasm test` (when Rust code is touched)

### If You Add CI

Recommended workflow location: `.github/workflows/ci.yml`

Suggested jobs:
- Rust checks (`fmt`, `clippy`, `test`)
- Web checks (`typecheck`, `lint`, `vitest`)
- Build checks (`build:wasm`, `web build`)

## 🚀 Pre-Commit vs CI

| Feature | Pre-Commit Hooks | CI/CD Pipeline |
|---------|-----------------|----------------|
| **When** | Before every local commit | On push/PR (if configured) |
| **Speed** | Fast (~7-20s) | Slower (~2-5min) |
| **Scope** | Only staged files | Entire codebase |
| **Can Skip** | Yes (--no-verify) | No (when branch protection is enabled) |
| **Purpose** | Fast feedback | Quality gate |

## 📋 Checks Performed

### Rust Checks

```bash
# 1. Code formatting
cargo fmt --all -- --check

# 2. Linting
cargo clippy --all-targets --all-features -- -D warnings

# 3. Tests
cargo test
```

### Frontend Checks

```bash
# 1. TypeScript type check
tsc --noEmit

# 2. ESLint
eslint . --ext ts,tsx

# 3. Tests
vitest --run
```

## 🐛 Troubleshooting (Local/CI)

### Issue: Clippy fails in CI but passes locally

**Cause**: Different Rust versions or Clippy versions (same applies to local vs CI)

**Fix**:
```bash
# Update Rust toolchain
rustup update

# Update Clippy
rustup component add clippy

# Run Clippy locally
cd wasm && cargo clippy --all-targets --all-features -- -D warnings
```

### Issue: TypeScript fails in CI but passes locally

**Cause**: Different Node.js versions or dependencies

**Fix**:
```bash
# Clean install dependencies
cd web
rm -rf node_modules package-lock.json
npm install

# Run type check locally
npm run typecheck
```

### Issue: Build fails in CI but passes locally

**Cause**: WASM target not installed

**Fix**:
```bash
# Add WASM target
rustup target add wasm32-unknown-unknown

# Rebuild WASM
cd wasm && wasm-pack build --target web --out-dir ../web/public/wasm crates/wasm-bindings
```

## 💡 Best Practices

### 1. Run Pre-Commit Checks Before Pushing

```bash
# Run all checks locally
make lint
make typecheck

# Or run the pre-commit hook manually
bash scripts/pre-commit.sh
```

### 2. Keep Dependencies Updated

```bash
# Update npm dependencies
cd web
npm update

# Update Rust dependencies
cd wasm
cargo update
```

### 3. Fix Warnings Before Committing

- **Clippy warnings**: Fix them or add `#[allow(clippy::lint_name)]` with explanation
- **ESLint warnings**: Fix them or disable with `// eslint-disable-next-line`
- **TypeScript errors**: Fix type mismatches, use `any` only as last resort

### 4. Write Tests for Critical Code

```rust
#[cfg(test)]
mod tests {
    #[test]
    fn test_accumulator() {
        let mut acc = Accumulator::new();
        acc.add(1024);
        assert_eq!(acc.total(), 1024);
    }
}
```

```typescript
describe('FileAnalyzer', () => {
  it('should calculate total size', () => {
    const analyzer = new FileAnalyzer();
    analyzer.add_files([1024, 2048]);
    expect(analyzer.get_total()).toBe(3072);
  });
});
```

## 🔄 Branch Protection (Optional)

After adding CI workflows, configure branch protection in GitHub:

1. Go to **Settings** → **Branches**
2. Edit `main` branch
3. Enable required status checks based on your workflow jobs

## 🚀 Deployment (Future)

When ready to deploy, add a deploy job:

```yaml
deploy:
  name: Deploy to Production
  runs-on: ubuntu-latest
  needs: [build]
  if: github.ref == 'refs/heads/main'

  steps:
    - name: Deploy to Netlify/Vercel
      run: |
        # Add deployment commands
```

## 📚 Related Documentation

- [Pre-Commit Hooks Guide](./pre-commit-hooks.md)
- [Development Setup](./setup.md)
- [Testing Guide](../../README.md#testing)
