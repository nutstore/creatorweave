# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Prerequisites

Ensure you have the following installed:

- **Node.js** (18+) - [Install](https://nodejs.org/)
- **pnpm** (8+) - [Install](https://pnpm.io/installation)
- **Rust** (1.75+) - [Install](https://rustup.rs/) - Optional, for WASM development
- **Git** - [Install](https://git-scm.com/)

### Step 1: Clone and Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/creatorweave.git
cd creatorweave

# Install dependencies
pnpm install
```

### Step 2: Start Development Server

```bash
# Start the main web application
cd web && pnpm run dev
```

The application will be available at **http://localhost:5173**

**Note**: The development server requires COOP/COEP headers for SQLite WASM support, which are automatically configured in `vite.config.ts`.

### Step 3: (Optional) Start Remote Session

To enable mobile remote control:

```bash
# Terminal 1: Start relay server
cd relay-server && pnpm run dev

# Terminal 2: Start mobile web
cd mobile-web && pnpm run dev --port 3002
```

Then:
1. Open **http://localhost:5173** (Desktop)
2. Click "Remote Session" → "Create Session"
3. Scan QR code with mobile device at **http://localhost:3002**

### Step 4: Build for Production

```bash
# Build WASM modules (if modified)
cd web && pnpm run build:wasm

# Build web application
pnpm run build

# Preview the build
pnpm run preview
```

## 📋 Available Commands

### Main Application (web/)

```bash
# Development
pnpm run dev              # Start dev server (localhost:5173)
pnpm run build            # Build for production
pnpm run preview          # Preview production build

# Testing
pnpm run test             # Run Vitest unit tests
pnpm run test:ui          # Run tests with UI
pnpm run test:coverage    # Run tests with coverage
pnpm run test:e2e         # Run Playwright E2E tests

# Code Quality
pnpm run lint             # Run ESLint
pnpm run lint:fix         # Fix ESLint issues
pnpm run format           # Format code with Prettier
pnpm run typecheck        # Run TypeScript type checker

# WASM
pnpm run build:wasm       # Build WASM modules (Rust required)
```

### Packages

```bash
# UI Package
cd packages/ui
pnpm run build            # Build UI components
pnpm run storybook        # Start Storybook (localhost:6006)
pnpm run build-storybook  # Build Storybook static

# Other packages
cd packages/[package-name]
pnpm run typecheck        # Type check package
```

### Mobile Web (mobile-web/)

```bash
cd mobile-web
pnpm run dev -- --port 3002  # Start dev server on 3002 (recommended for remote flow)
pnpm run build            # Build for production
pnpm run typecheck        # Run TypeScript type checker
```

### Relay Server (relay-server/)

```bash
cd relay-server
pnpm run dev              # Start relay server (default port 3001)
pnpm run build            # Build TypeScript
pnpm run start            # Start production server
```

## 🏗️ Project Structure

```
creatorweave/
├── web/                   # React frontend (Desktop)
│   ├── src/
│   │   ├── agent/         # AI agent system
│   │   │   ├── agent-loop.ts
│   │   │   ├── context-manager.ts
│   │   │   ├── tools/      # 30+ agent tools
│   │   │   └── llm/        # LLM providers
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── python/        # Pyodide integration
│   │   ├── sqlite/        # SQLite WASM database
│   │   ├── store/         # Zustand stores
│   │   ├── workers/       # Web Workers
│   │   └── export/        # Data export
│   └── package.json
│
├── mobile-web/            # React frontend (Mobile Remote)
│   └── src/
│       ├── components/    # Mobile-optimized components
│       ├── pages/         # Mobile pages
│       └── contexts/      # React contexts
│
├── relay-server/          # Socket.IO relay server
│   └── src/index.ts
│
├── packages/              # Monorepo shared packages
│   ├── ui/                # Shared UI components (Radix UI)
│   ├── conversation/      # Conversation components
│   ├── encryption/        # E2E encryption
│   ├── i18n/              # Internationalization
│   └── config/            # Shared configurations
│
├── wasm/                  # Rust + WASM modules
│   └── crates/
│
├── docs/                  # Documentation
│   ├── architecture/      # Architecture docs
│   ├── development/       # Development guides
│   └── api/               # API reference
│
└── scripts/               # Development scripts
```

## 🐛 Troubleshooting

### Issue: COOP/COEP Headers Missing

SQLite WASM requires COOP/COEP headers. If you see errors:

```bash
# Check vite.config.ts has the headers:
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
}
```

### Issue: Port Already in Use

```bash
# Kill process on port 5173 (macOS/Linux)
lsof -ti:5173 | xargs kill -9

# Or use a different port
pnpm run dev -- --port 3001
```

### Issue: Dependencies Not Installing

```bash
# Clear pnpm cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Issue: SQLite WASM Not Loading

```bash
# Clear OPFS storage
# In browser DevTools → Application → Origin Private File System
# Delete all files

# Or use the "Reset Storage" option in Settings
```

### Issue: Pyodide Loading Failed

```bash
# Check CDN connectivity
curl -I https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js

# If blocked, you may need to use a different CDN or mirror
```

## 📚 Next Steps

- Read [Architecture Overview](../architecture/overview.md)
- Read [Agent System Documentation](../agent-system.md)
- Explore the [API Documentation](../api/README.md)
- Read [Python Integration Guide](../../web/src/python/README.md)

## 💡 Tips

1. **Hot Reload**: Vite provides hot module replacement for fast development
2. **WASM Changes**: When modifying Rust code, run `pnpm run build:wasm`
3. **TypeScript**: The project uses strict TypeScript for type safety
4. **Code Style**: Run `pnpm run format` to format code with Prettier
5. **Testing**: Use `pnpm run test:ui` for interactive test UI

## 🔑 First Run Setup

1. **Configure API Key**: Go to Settings → API Configuration
2. **Select Folder**: Click "Open Directory" to select a local folder
3. **Start Chatting**: Type your question in the input box
4. **Explore Tools**: Use the command palette (`Ctrl/Cmd + K`) to access features

## 🤝 Need Help?

- Check existing [Issues](https://github.com/yourusername/creatorweave/issues)
- Read [Documentation](../../README.md)
- Start a [Discussion](https://github.com/yourusername/creatorweave/discussions)
