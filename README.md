# AI Workspace

<div align="center">

**AI-native creator workspace for local-first creation, knowledge, and multi-agent orchestration**

[![Rust](https://img.shields.io/badge/Rust-1.75%2B-orange.svg)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-18%2B-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

English | [简体中文](./README.zh.md)

</div>

## What is AI Workspace?

AI Workspace is an **AI-native creator workspace** for content creators and builder teams. It combines local-first file workflows, AI copilots, knowledge-base workflows, and multi-agent orchestration in one browser-native product.

### Key Product Description

- **AI-Powered Conversations**: Chat naturally with your codebase using advanced AI agents with multi-agent collaboration
- **Knowledge Workflows**: Build reusable context from project files and structured notes
- **Multi-Agent Orchestration**: Design and run multi-step creative workflows with specialized agents
- **Local File Access**: Direct interaction with files through modern browser APIs (File System Access API)
- **Code Intelligence**: Understand, analyze, and manipulate code with 30+ intelligent tools
- **Python Integration**: Execute Python code in the browser with Pyodide (pandas, numpy, matplotlib support)
- **Privacy First**: All processing happens locally - your data never leaves your browser
- **Remote Control**: Control your workspace from mobile devices via encrypted relay server

## Features

### Conversation System
- **Threading**: Organize conversations into threads for better context management
- **Message Bubbles**: Rich message display with markdown support, syntax highlighting, and inline code rendering
- **Reasoning Visualization**: See AI thinking process with collapsible reasoning sections
- **Tool Call Display**: View all tool invocations with parameters and results
- **Streaming Support**: Real-time streaming of AI responses for faster feedback

### Code Intelligence
- **File Tree Panel**: Browse and explore your project structure
- **Syntax Highlighting**: Code display with Shiki syntax highlighting
- **File Comparison**: Side-by-side diff view for comparing file versions
- **Code Navigation**: Quick access to files with line numbers and search

### Data Analysis
- **Data Visualization**: Chart.js integration for visualizing file statistics
- **Data Preview**: Preview JSON, CSV, and other structured data formats
- **Batch Operations**: Apply changes to multiple files at once
- **Advanced Search**: Regex-based search with context lines
- **Data Export**: Export analysis results to CSV, JSON, Excel, or image formats

### Workspace Management
- **Theme Support**: Light, dark, and system theme options
- **Keyboard Shortcuts**: Command palette for quick access to all features (press `Ctrl+K` or `Cmd+K`)
- **Recent Files**: Quick access to recently viewed files
- **Layout Persistence**: Your workspace layout is saved automatically
- **Onboarding Tour**: Guided tour for first-time users

### Development Tools
- **Skills Manager**: Create and manage reusable AI skills with on-demand loading
- **Tools Panel**: Access 30+ development tools including file operations, code analysis, and data visualization
- **Python Integration**: Execute Python code in the browser (Pyodide) with pandas, numpy, matplotlib, openpyxl
- **MCP Integration**: Configure Model Context Protocol providers for extended capabilities
- **WASM Acceleration**: High-performance file operations using Rust-compiled WebAssembly modules

### User Scenarios
- **Developers**: Code understanding, refactoring, debugging, and code review
- **Data Analysts**: Data exploration, visualization, and report generation
- **Students**: Learning assistance, problem-solving with step-by-step guidance
- **Office Workers**: Document processing, data transformation, and automation

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Open command palette |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + ,` | Open workspace settings |
| `Ctrl/Cmd + 1/2/3` | Switch resource tabs |
| `Shift + ?` | Show keyboard shortcuts |
| `Escape` | Close panels/dialogs |

## Getting Started

### Prerequisites

- Node.js (18+)
- pnpm (recommended) or npm/yarn
- A modern browser with File System Access API support

### Quick Start

```bash
# Clone the repository
git clone https://github.com/nutstore/creatorweave.git
cd creatorweave

# Install dependencies
pnpm install

# Start desktop web app
pnpm -C web run dev

# Open http://localhost:5173
```

### Building for Production

```bash
# Build WASM modules
pnpm -C web run build:wasm

# Build web application
pnpm -C web run build

# Output in web/dist/
```

## Development

### Project Structure

```
creatorweave/
├── web/                    # React frontend application (Desktop)
│   ├── src/
│   │   ├── agent/         # AI agent logic, tools, multi-agent collaboration
│   │   ├── components/    # React components (UI, conversation, code viewer)
│   │   ├── hooks/         # Custom React hooks
│   │   ├── store/         # State management (Zustand stores)
│   │   ├── sqlite/        # SQLite WASM database layer
│   │   ├── python/        # Pyodide Python integration
│   │   ├── workers/       # Web Workers (file discovery, plugins)
│   │   └── export/        # Data export functionality
│   └── package.json
├── mobile-web/             # React frontend (Mobile Remote Control)
│   └── src/               # Mobile-optimized UI for remote sessions
├── relay-server/           # Socket.IO relay server for remote sessions
├── wasm/                   # Rust + WebAssembly modules
│   └── crates/            # Core logic, WASM bindings, plugin API/SDK
├── packages/               # Monorepo shared packages
│   ├── ui/                # Shared UI components (Radix UI + Storybook)
│   ├── conversation/      # Conversation components
│   ├── encryption/        # E2E encryption (ECDH + AES-GCM)
│   ├── i18n/              # Internationalization
│   └── config/            # Shared configurations
├── docs/                   # Project documentation
│   ├── architecture/      # Architecture documentation
│   ├── development/       # Development guides
│   └── design/            # Design specifications
└── scripts/                # Development and build scripts
```

### Available Scripts

```bash
# Desktop Web (web/)
pnpm -C web run dev
pnpm -C web run build
pnpm -C web run preview

# Mobile Web (mobile-web/)
pnpm -C mobile-web run dev -- --port 3002
pnpm -C mobile-web run typecheck

# Relay Server (relay-server/)
pnpm -C relay-server run dev
pnpm -C relay-server run build

# Quality (web/)
pnpm -C web run lint
pnpm -C web run typecheck
pnpm -C web run test
pnpm -C web run test:e2e
```

## Documentation

- [Documentation Index](./docs/README.md) - Central docs entry and maintenance conventions

### User Documentation
- [User Guide](./USER_GUIDE.md) - How to use all features
- [Changelog](./CHANGELOG.md) - Version history and changes

### Developer Documentation
- [Developer Portal (CN)](./docs/developer/guides/index.md) - Structured developer docs in Chinese
- [Quick Start Guide (EN)](./docs/development/quick-start.md) - Get started in 5 minutes
- [Architecture Overview](./docs/architecture/overview.md) - System architecture and design

### Technical Documentation
- [Agent System](./docs/agent-system.md) - AI agent architecture and tools
- [Python Integration](./web/src/python/README.md) - Pyodide integration guide
- [SQLite Storage](./web/src/sqlite/README.md) - SQLite WASM storage architecture
- [Remote Session](./docs/relay-server/remote-session-architecture.md) - Mobile remote control design
- [Plugin System](./docs/plugin-system/plugin-system-architecture.md) - Dynamic plugin system
- [MCP Integration](./docs/MCP_INTEGRATION_DESIGN.md) - Model Context Protocol

### API Documentation
- [API Index](./docs/api/README.md) - Stores and services API notes

## Browser Compatibility

| Browser | Version | File System Access | OPFS | SQLite WASM |
|---------|---------|-------------------|------|-------------|
| Chrome | 86+ | Full support | Full support | Full support |
| Edge | 86+ | Full support | Full support | Full support |
| Firefox | 111+ | Partial | Partial | Partial* |
| Safari | 16.4+ | No | No | Fallback to IDB |

*Firefox requires COOP/COEP headers to be configured.

## Contributing

We welcome contributions. Please read:

- [Contributing Guide](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
- [Developer Guide](./DEVELOPER_GUIDE.md)

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Acknowledgments

### Core Technologies
- [wasm-bindgen](https://github.com/rustwasm/wasm-bindgen) - Rust to WebAssembly bindings
- [React](https://react.dev/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Vite](https://vitejs.dev/) - Fast build tool and dev server

### Libraries & Tools
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components built on Radix UI
- [Zustand](https://github.com/pmndrs/zustand) - Lightweight state management
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [SQLite WASM](https://sqlite.org/wasm) - SQLite in WebAssembly
- [Pyodide](https://pyodide.org/) - Python runtime for the browser
- [Socket.IO](https://socket.io/) - Real-time bidirectional communication
- [Chart.js](https://www.chartjs.org/) - Data visualization

### Development Tools
- [Vitest](https://vitest.dev/) - Fast unit testing
- [Playwright](https://playwright.dev/) - End-to-end testing
- [Storybook](https://storybook.js.org/) - Component development and documentation
- [ESLint](https://eslint.org/) - Code linting
- [Prettier](https://prettier.io/) - Code formatting

---

<div align="center">

**Made with ❤️ by the community**

</div>
