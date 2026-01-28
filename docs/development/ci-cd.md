# CI/CD Guide

## Overview

This project uses GitHub Actions for continuous integration and deployment. The CI pipeline runs the same checks as the pre-commit hooks, ensuring code quality is maintained even if hooks are bypassed.

## 🔄 CI Pipeline

### Workflow: `.github/workflows/ci.yml`

The CI workflow runs on:
- **Push** to `main` or `develop` branches
- **Pull requests** to `main` or `develop` branches

### Jobs

#### 1. Rust Checks

```yaml
- Check formatting (cargo fmt --check)
- Run Clippy linter (cargo clippy -D warnings)
- Run Rust tests (cargo test)
```

#### 2. Frontend Checks

```yaml
- TypeScript type check (tsc --noEmit)
- ESLint (eslint . --ext ts,tsx)
- Run tests (vitest)
```

#### 3. Build Project

```yaml
- Build WASM module (wasm-pack build)
- Build frontend (vite build)
- Upload build artifacts
```

## 🚀 Pre-Commit vs CI

| Feature | Pre-Commit Hooks | CI/CD Pipeline |
|---------|-----------------|----------------|
| **When** | Before every local commit | On push/PR |
| **Speed** | Fast (~7-20s) | Slower (~2-5min) |
| **Scope** | Only staged files | Entire codebase |
| **Can Skip** | Yes (--no-verify) | No (blocks PR) |
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

## 🐛 Troubleshooting CI Failures

### Issue: Clippy fails in CI but passes locally

**Cause**: Different Rust versions or Clippy versions

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

## 📊 CI Status Badge

Add to your README:

```markdown
[![CI](https://github.com/yourusername/browser-fs-analyzer/workflows/CI/badge.svg)]
```

## 🔄 Branch Protection

Configure branch protection in GitHub:

1. Go to **Settings** → **Branches**
2. Edit `main` branch
3. Enable:
   - ✅ **Require status checks to pass before merging**
   - ✅ **Require branches to be up to date before merging**
   - ✅ Select required checks:
     - Rust Checks
     - Frontend Checks
     - Build Project

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
