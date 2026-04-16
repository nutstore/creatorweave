# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CreatorWeave is an **AI-native creator workspace** that enables natural language interaction with local files. Built with React, TypeScript, Rust/WASM, and Python (Pyodide).

### Key Features
- AI-powered conversations with multi-agent collaboration
- Local file access via File System Access API
- Python code execution in browser (Pyodide)
- Native filesystem sync for workspace files
- Privacy-first: all processing happens locally

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server
make dev
# or: cd web && pnpm dev

# Build (WASM + frontend)
make build

# Run tests
make test
# or: cd web && pnpm test

# Run single test file
cd web && pnpm test:run src/path/to/file.test.ts

# Run tests in watch mode
cd web && pnpm test:watch

# Run E2E tests
cd web && pnpm test:e2e

# Lint and type check
make lint
make typecheck
# or: cd web && pnpm lint && pnpm typecheck

# Format code
make format
# or: cd web && pnpm format
```

## Architecture

### Monorepo Structure
```
packages/          # Shared packages (ui, config, i18n, encryption)
web/              # Main React application
mobile-web/       # Mobile web interface
relay-server/     # Remote control relay server
wasm/             # Rust WebAssembly modules
```

### Frontend Architecture (web/src/)

| Directory | Purpose |
|-----------|---------|
| `agent/` | AI agent loop, tool execution, message handling |
| `components/` | React UI components |
| `store/` | Zustand state management |
| `opfs/` | Origin Private File System operations |
| `python/` | Pyodide integration, Python execution |
| `services/` | Business logic services |
| `sqlite/` | SQLite WASM database |
| `skills/` | AI skills system |

### State Management
- **Zustand** stores in `web/src/store/`
- Key stores: `conversation.store.ts`, `workspace.store.ts`, `settings.store.ts`
- Use immer middleware for immutable updates

### Key Patterns

1. **Component Imports**: Use `@/` alias (e.g., `import { X } from '@/components/x'`)

2. **UI Package**: Shared components in `packages/ui`. After modifying, rebuild with:
   ```bash
   cd packages/ui && pnpm build
   ```

3. **File Icons**: Use `@iconify/react` with `vscode-icons` prefix in `change-helpers.tsx` and `FileTreePanel.tsx`

4. **SVG Icons**: Use inline `<svg>` with proper `path` attributes. Always verify `d` attribute is valid.

## Storage

- **SQLite WASM**: Main database for conversations, workspaces, skills
- **OPFS**: File content caching and workspace storage
- **IndexedDB**: Fallback storage, auto-migrated to SQLite

## Testing

- **Vitest**: Unit tests with React Testing Library
- **Playwright**: E2E tests
- Test files: `*.test.ts`, `*.test.tsx`
- Test utilities: `web/src/test-helpers/`
