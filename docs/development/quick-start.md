# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Prerequisites

Ensure you have the following installed:

- **Rust** (1.75+) - [Install](https://rustup.rs/)
- **Node.js** (18+) - [Install](https://nodejs.org/)
- **Git** - [Install](https://git-scm.com/)

### Step 1: Clone and Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/browser-fs-analyzer.git
cd browser-fs-analyzer

# Run automatic setup (installs all dependencies)
make setup
```

This script will:
- ✅ Check Rust and Node.js installation
- ✅ Install wasm-pack
- ✅ Add WASM target
- ✅ Install npm dependencies

### Step 2: Start Development Server

```bash
# Start the development server
make dev
```

Or run the script directly:

```bash
bash scripts/dev.sh
```

The application will be available at **http://localhost:3000**

### Step 3: Build for Production

```bash
# Build all projects (WASM + frontend)
make build
```

Or run the script directly:

```bash
bash scripts/build.sh

# Preview the build
cd web && npm run preview
```

## 📋 Available Commands

### Quick Start Commands

| Command | Description |
|---------|-------------|
| `make setup` | First-time setup (install all dependencies) |
| `make dev` | Start development server |
| `make build` | Build all projects (WASM + frontend) |
| `make test` | Run all tests |
| `make clean` | Clean build artifacts |

### Script Files

Located in `scripts/` directory:

| Script | Description |
|--------|-------------|
| `setup.sh` | First-time environment setup |
| `dev.sh` | Start development server |
| `build.sh` | Build all projects |
| `test.sh` | Run all tests |
| `clean.sh` | Clean build artifacts |

### Individual Component Commands

```bash
# Build WASM module only
make build-wasm

# Build frontend only
make build-web

# Run Rust tests
make test-rust

# Run frontend tests
make test-web
```

## 🔧 Manual Setup (Alternative)

If you prefer manual setup:

```bash
# 1. Install Rust tools
cargo install wasm-pack
rustup target add wasm32-unknown-unknown

# 2. Install npm dependencies
cd web
npm install

# 3. Build WASM
cd ../wasm
wasm-pack build --target web --out-dir ../web/public/wasm crates/wasm-bindings

# 4. Start dev server
cd ../web
npm run dev
```

## 🏗️ Project Structure

```
browser-fs-analyzer/
├── wasm/                  # Rust + WASM module
│   ├── crates/
│   │   ├── core/          # Core computation logic
│   │   └── wasm-bindings/ # WASM bindings
│   └── scripts/           # WASM build scripts
│
├── web/                   # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── store/         # Zustand stores
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # Business logic
│   │   └── lib/           # Utilities
│   └── package.json
│
├── scripts/               # Development scripts
│   ├── setup.sh
│   ├── dev.sh
│   ├── build.sh
│   ├── test.sh
│   └── clean.sh
│
└── docs/                  # Documentation
```

## 🐛 Troubleshooting

### Issue: wasm-pack not found

```bash
cargo install wasm-pack
```

### Issue: WASM target not found

```bash
rustup target add wasm32-unknown-unknown
```

### Issue: Port 3000 already in use

```bash
# Kill process on port 3000 (macOS/Linux)
lsof -ti:3000 | xargs kill -9

# Or use a different port
cd web && npm run dev -- --port 3001
```

### Issue: Dependencies not installing

```bash
# Clear npm cache and reinstall
cd web
rm -rf node_modules package-lock.json
npm install
```

## 📚 Next Steps

- Read [Architecture Overview](../architecture/overview.md)
- Read [Development Setup Guide](../development/setup.md)
- Explore the [API Documentation](../api/README.md)

## 💡 Tips

1. **Hot Reload**: Vite provides hot module replacement for faster development
2. **WASM Changes**: When modifying Rust code, run `make build-wasm` to rebuild the WASM module
3. **TypeScript**: The project uses strict TypeScript - ensure type safety
4. **Code Style**: Run `make fmt` to format Rust code and `npm run format` for frontend code

## 🤝 Need Help?

- Check [Issues](https://github.com/yourusername/browser-fs-analyzer/issues)
- Read [Documentation](../README.md)
- Start a [Discussion](https://github.com/yourusername/browser-fs-analyzer/discussions)
