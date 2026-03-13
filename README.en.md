# CreatorWeave

<div align="center">

**AI-native creator workspace for local-first creation, knowledge, and multi-agent orchestration**

[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18%2B-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

English | [简体中文](./README.md)

</div>

## ✨ Features

- 🧠 **AI-Native Creator Workflow** - Built for content creation and assisted production
- 🕸️ **Knowledge + Multi-Agent Flows** - Connect context, memory, and agent orchestration
- 🌐 **Browser-Native** - Leverages modern browser APIs including File System Access API
- ⚡ **High Performance** - Rust + WebAssembly for compute-intensive tasks
- 🎨 **Modern UI** - Built with React + Tailwind CSS + shadcn/ui
- 💾 **SQLite + OPFS Storage** - SQLite WASM with OPFS VFS for high-performance local database
- 🔄 **Seamless Migration** - Automatic migration from IndexedDB to SQLite
- 🔐 **Secure Sandbox** - Runs entirely in browser sandbox, no data uploaded
- 📱 **Remote Control** - E2E encrypted remote session with mobile device support [See docs](./docs/relay-server/remote-session-architecture.md)

## 🚀 Quick Start

### Prerequisites

- Rust (1.75+)
- Node.js (18+)
- pnpm (recommended) or npm/yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/creatorweave.git
cd creatorweave

# Install dependencies
make install
# or
cd web && pnpm install
```

### Development

```bash
# Start development server
make dev
# or
cd web && pnpm run dev

# Visit http://localhost:3000
```

### Build

```bash
# Full build (WASM + frontend)
make build

# Output in web/dist/
```

## 📖 Usage

### 1. Open a Project Folder

Click "Select Folder" to connect a local project or content workspace.

### 2. Chat and Execute

Use natural language to inspect files, transform content, and run coding/data tasks.

### 3. Build Reusable Context

Persist useful context in conversations, knowledge notes, and agent workflows.

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React + TypeScript |
| Build Tool | Vite |
| UI Components | shadcn/ui + Tailwind CSS |
| State Management | Zustand |
| Data Storage | SQLite WASM + OPFS VFS |
| Compute Layer | Rust + WebAssembly |
| Browser APIs | File System Access API, Origin Private File System |

### Architecture Diagram

```
┌─────────────────────────────────────┐
│         React UI (Frontend)          │
│  - shadcn/ui components              │
│  - Tailwind CSS styling              │
│  - Zustand state management          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   JavaScript Business Logic Layer   │
│  - File System Access API            │
│  - Directory traversal               │
│  - Data collection                   │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   WASM Bindings (wasm-bindgen)      │
│  - JS ↔ Rust bridge                 │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Rust Core Library (Pure Rust)     │
│  - Accumulation algorithm            │
│  - Statistical computation           │
└─────────────────────────────────────┘
```

**Detailed Documentation**: [docs/architecture/overview.md](./docs/architecture/overview.md)

## 💾 Storage Architecture

### SQLite + OPFS VFS

The application uses **SQLite WASM** with **OPFS VFS** for local data persistence:

```
┌─────────────────────────────────────┐
│         React UI (Frontend)          │
│  - Graceful fallback: IndexedDB      │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    Repository Layer (Data Access)    │
│  - conversations, skills, plugins     │
│  - sessions, api-keys                │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   SQLite Worker (Web Worker)         │
│  - @sqlite.org/sqlite-wasm           │
│  - OPFS VFS for persistence          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│   Origin Private File System (OPFS) │
│  - /bfosa-unified.sqlite             │
│  - Auto-persisted, no manual save     │
└─────────────────────────────────────┘
```

### Storage Features

| Feature | Description |
|---------|-------------|
| **Single-File DB** | All data in `/bfosa-unified.sqlite` |
| **Auto Persistence** | OpfsDb auto-syncs writes to OPFS |
| **ACID Transactions** | Full transaction support |
| **SQL Queries** | JOIN, aggregation, and complex queries |
| **Seamless Migration** | Auto-migrate from IndexedDB on first run |

### COOP/COEP Requirements

OPFS VFS requires `SharedArrayBuffer`, which needs COOP/COEP response headers:

```typescript
// vite.config.ts (auto-configured via vite-plugin-sqlite)
server: {
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
}
```

**Diagnostic Tool**: Visit `/test-coop-coep.html` to verify COOP/COEP configuration

## 🔑 Core Features

### Phase 1: Basic Features ✅

- ✅ Select local folder
- ✅ Recursive directory traversal
- ✅ Collect file size information
- ✅ WASM accumulation calculation
- ✅ Real-time result display

### Phase 2: Advanced Features ✅

- ✅ **Dynamic Plugin System** - Support external WASM plugins
- 🔲 **Secure Content Preview** - Preview HTML/MD in iframe sandbox (Planned)
- 🔲 **Batch File Processing** - Batch rename, add copyright headers (Planned)

## 📦 Project Structure

```
creatorweave/
├── wasm/                      # Rust + WASM
│   ├── crates/
│   │   ├── core/              # Core library
│   │   ├── wasm-bindings/     # WASM bindings
│   │   ├── plugin-api/        # Plugin API
│   │   ├── plugin-sdk/        # Plugin SDK
│   │   └── example-plugins/   # Example plugins
│   └── scripts/               # Build scripts
│
├── web/                       # React frontend (Desktop)
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── store/             # Zustand stores
│   │   ├── services/          # Business logic
│   │   ├── sqlite/            # SQLite storage layer
│   │   │   ├── repositories/  # Data repositories
│   │   │   ├── sqlite-database.ts
│   │   │   ├── sqlite-worker.ts
│   │   │   └── migration.ts   # IndexedDB → SQLite migration
│   │   ├── storage/           # Storage initialization
│   │   ├── remote/            # Remote session
│   │   └── wasm/              # WASM integration
│   └── package.json
│
├── mobile-web/                # React frontend (Mobile Remote)
│   └── src/
│
├── relay-server/              # Socket.IO relay server
│   └── src/
│
├── packages/                  # Monorepo shared packages
│   ├── ui/                    # Shared UI components
│   ├── encryption/            # E2E encryption
│   └── conversation/          # Conversation management
│
├── plugins/                   # Plugin development docs
└── docs/                      # Documentation
    ├── architecture/          # Architecture docs
    └── development/           # Development guides
```

## 🧪 Testing

```bash
# Run all tests
make test

# Rust tests
make test-rust

# Frontend tests
make test-web
```

## 📚 Documentation

- [Architecture Overview](./docs/architecture/overview.md) - Complete technical architecture
- [SQLite Storage Architecture](./web/src/sqlite/README.md) - SQLite + OPFS VFS storage details
- [Development Setup](./docs/development/setup.md) - Development environment guide
- [Rust/WASM Data Flow](./docs/architecture/rust-wasm-flow.md) - WASM integration details

## 🔧 Development Commands

```bash
make help        # Show all commands
make install     # Install dependencies
make dev         # Start dev server
make build       # Full build
make test        # Run tests
make clean       # Clean build artifacts
```

## 🌐 Browser Compatibility

| Browser | Version | File System Access API | OPFS | SQLite WASM |
|---------|---------|----------------------|------|-------------|
| Chrome | 86+ | ✅ | ✅ | ✅ |
| Edge | 86+ | ✅ | ✅ | ✅ |
| Opera | 72+ | ✅ | ✅ | ✅ |
| Firefox | 111+ | ⚠️ | ⚠️ | ⚠️ (requires COOP/COEP) |
| Safari | 16.4+ | ❌ | ❌ | ❌ |

**Notes**:
- **OPFS VFS** requires `SharedArrayBuffer` which needs COOP/COEP response headers
- Firefox has limited support and may need manual OPFS enablement
- Safari doesn't support SQLite WASM OPFS mode yet, will auto-fallback to IndexedDB

## 🤝 Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

1. Fork the project
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

- [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen) - Rust ↔ WebAssembly bindings
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Zustand](https://github.com/pmndrs/zustand) - Lightweight state management
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

---

<div align="center">

**Made with ❤️ by the community**

</div>
