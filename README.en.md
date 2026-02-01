# Browser File System Analyzer

<div align="center">

**A Browser-Based Local File System Analyzer**

[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18%2B-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

English | [简体中文](./README.md)

</div>

## ✨ Features

- 🌐 **Browser-Native** - Leverages the File System Access API of modern browsers
- ⚡ **High Performance** - Rust + WebAssembly for compute-intensive tasks
- 🎨 **Modern UI** - Built with React + Tailwind CSS + shadcn/ui
- 💾 **Smart Caching** - Three-tier storage (OPFS, IndexedDB, localStorage)
- 🔄 **State Persistence** - Zustand + persist middleware for quick state recovery
- 🔐 **Secure Sandbox** - Runs entirely in browser sandbox, no data uploaded

## 🚀 Quick Start

### Prerequisites

- Rust (1.75+)
- Node.js (18+)
- pnpm (recommended) or npm/yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/browser-fs-analyzer.git
cd browser-fs-analyzer

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

### 1. Select Folder

Click "Select Folder" button to choose a local folder to analyze.

### 2. Automatic Analysis

The app will automatically recursively traverse the folder and collect file size information.

### 3. View Results

Real-time analysis results:
- 📊 Total file count
- 📦 Total size (auto-convert to KB/MB/GB)
- 📈 Average file size
- 🗂️ File type distribution

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend Framework | React + TypeScript |
| Build Tool | Vite |
| UI Components | shadcn/ui + Tailwind CSS |
| State Management | Zustand |
| Compute Layer | Rust + WebAssembly |
| Browser API | File System Access API |

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

## 🔑 Core Features

### Phase 1: Basic Features ✅

- ✅ Select local folder
- ✅ Recursive directory traversal
- ✅ Collect file size information
- ✅ WASM accumulation calculation
- ✅ Real-time result display

### Phase 2: Advanced Features (Planned)

- 🔲 **Dynamic Plugin System** - Support external WASM plugins
- 🔲 **Secure Content Preview** - Preview HTML/MD in iframe sandbox
- 🔲 **Batch File Processing** - Batch rename, add copyright headers

## 📦 Project Structure

```
browser-fs-analyzer/
├── wasm/                      # Rust + WASM
│   ├── crates/
│   │   ├── core/              # Core library
│   │   └── wasm-bindings/     # WASM bindings
│   └── scripts/               # Build scripts
│
├── web/                       # React frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── store/             # Zustand stores
│   │   ├── hooks/             # Custom hooks
│   │   ├── services/          # Business logic
│   │   └── lib/               # Utility functions
│   ├── package.json
│   └── vite.config.ts
│
└── docs/                      # Documentation
    ├── architecture/          # Architecture docs
    ├── api/                   # API docs
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

| Browser | Version | File System Access API | OPFS |
|---------|---------|----------------------|------|
| Chrome | 86+ | ✅ | ✅ |
| Edge | 86+ | ✅ | ✅ |
| Opera | 72+ | ✅ | ✅ |
| Firefox | - | ❌ | ⚠️ |
| Safari | - | ❌ | ❌ |

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
