---
title: Environment Setup
order: 102
---

# Environment Setup Guide

## Prerequisites

### Required Tools

- **Rust** (1.75.0+) - compiling WASM modules
- **Node.js** (18.0+) - frontend development and builds
- **Git** - version control

### Optional Tools

- **Make** - build automation
- **cargo-watch** - automatic recompilation
- **Playwright** - E2E testing

## Installation Steps

### 1. Install Rust

```bash
# macOS/Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Windows
# Download from: https://rustup.rs/

# Verify installation
rustc --version
cargo --version
```

### 2. Install wasm-pack

```bash
cargo install wasm-pack
```

### 3. Install Node.js

```bash
# macOS (Homebrew)
brew install node

# Linux (Ubuntu)
sudo apt install nodejs npm

# Windows
# Download from: https://nodejs.org/

# Verify installation
node --version
npm --version
```

### 4. Clone the project

```bash
git clone https://github.com/nutstore/creatorweave.git
cd creatorweave
```

### 5. Install dependencies

```bash
# Install dependencies with pnpm (recommended)
pnpm install

# Or install web dependencies only
cd web && pnpm install
```

### 6. Add the WASM target

```bash
rustup target add wasm32-unknown-unknown
```

## Development Commands

### Using the Makefile (recommended)

```bash
# List all commands
make help

# Install all dependencies
make install

# Start the dev server
make dev

# Build all projects
make build

# Run tests
make test

# Clean build artifacts
make clean
```

### Manual Commands

#### Build WASM

```bash
cd wasm
wasm-pack build --target web --out-dir ../web/public/wasm crates/wasm-bindings
```

#### Start the frontend dev server

```bash
cd web
pnpm run dev
```

#### Run tests

```bash
# Rust tests
cd wasm/crates/core
cargo test

# WASM tests
cd wasm/crates/wasm-bindings
wasm-pack test --headless --chrome

# Frontend tests
cd web
pnpm test
```

## IDE Configuration

### VS Code

Recommended extensions:

- **rust-analyzer** - Rust language support
- **ES7+ React/Redux/React-Native snippets** - React code snippets
- **Tailwind CSS IntelliSense** - Tailwind class name completions
- **Error Lens** - inline error display
- **Code Spell Checker** - spell checking

#### Workspace settings

The project ships a `.vscode/settings.json` containing:
- Rust formatting settings
- TypeScript settings
- Prettier settings
- ESLint settings

### WebStorm / IntelliJ IDEA

1. Install the **Rust plugin**
2. Enable **Node.js support**
3. Configure the **Tailwind CSS plugin**

## Project Structure

```
creatorweave/
├── wasm/                    # Rust + WASM modules
│   ├── Cargo.toml           # Workspace config
│   ├── crates/
│   │   ├── core/            # Core library
│   │   ├── wasm-bindings/   # WASM bindings
│   │   ├── plugin-api/      # Plugin API
│   │   ├── plugin-sdk/      # Plugin SDK template
│   │   └── example-plugins/ # Example plugins
│   └── scripts/             # Build scripts
│
├── web/                     # React frontend (desktop)
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── store/           # Zustand stores
│   │   ├── services/        # Business logic
│   │   ├── remote/          # Remote sessions
│   │   └── wasm/            # WASM integration
│   └── package.json
│
├── relay-server/            # Socket.IO relay server
│   └── src/
│
├── packages/                # Monorepo shared packages
│   ├── ui/                  # Shared UI components
│   ├── encryption/          # E2E encryption
│   └── conversation/        # Conversation management
│
├── plugins/                 # Plugin development docs
└── docs/                    # Documentation
    ├── zh/                  # Chinese docs
    └── en/                  # English docs
```

## FAQ

### Q: wasm-pack build fails?

**A**: Make sure Rust >= 1.75.0 and the wasm32-unknown-unknown target is installed.

```bash
rustup update
rustup target add wasm32-unknown-unknown
```

### Q: Vite cannot load the WASM module?

**A**: Check that the WASM file path is correct and the files exist under `web/public/wasm/`.

```bash
# Rebuild WASM
cd wasm && wasm-pack build --target web --out-dir ../web/public/wasm crates/wasm-bindings
```

### Q: TypeScript type errors?

**A**: Run `pnpm run typecheck` and make sure the WASM module's `.d.ts` files have been generated.

### Q: Browser compatibility issues (File System Access / OPFS)?

**A**: Prefer the latest Chrome/Edge. Other browsers vary significantly in capability and may trigger feature degradation (e.g. falling back to IndexedDB).

## Performance Tuning

### WASM optimization

Already configured in `wasm/Cargo.toml`:

```toml
[profile.release]
opt-level = "z"        # Optimize for size
lto = true             # Link-time optimization
codegen-units = 1      # Single codegen unit
strip = true           # Strip debug symbols
panic = "abort"        # Reduce panic handling code
```

### Vite optimization

Already configured in `web/vite.config.ts`:
- Code splitting (react-vendor, zustand)
- Source maps
- WASM module optimization

## Debugging Tips

### Rust debugging

```bash
# Use console_log to see Rust logs in the browser
cargo add console_log

# In Rust code
web_sys::console::log_1(&"Hello from Rust!".into());
```

### JavaScript debugging

Use the browser DevTools:
- **Sources** panel - inspect source and set breakpoints
- **Console** panel - view logs and errors
- **Network** panel - monitor network requests
- **Performance** panel - profile performance

### WASM debugging

1. Open `chrome://inspect/#web-workers` in Chrome
2. Select the WASM module to debug
3. Use the DevTools WASM debugger

## Next Steps

- Architecture overview: `docs/zh/developer/architecture/overview.md` (Chinese)
- API reference: `docs/zh/developer/reference/README.md` (Chinese)
