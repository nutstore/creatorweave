# CreatorWeave - Developer Guide

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Development Setup](#development-setup)
4. [Project Structure](#project-structure)
5. [Adding New Tools](#adding-new-tools)
6. [Testing Guide](#testing-guide)
7. [Build and Deploy](#build-and-deploy)
8. [Code Style Guidelines](#code-style-guidelines)

---

## Project Overview

CreatorWeave is an AI-native creator workspace built with React, TypeScript, and Rust/WASM. It enables natural language interaction with local files through modern browser APIs.

### Technology Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript 5, Vite |
| **UI** | shadcn/ui, Tailwind CSS, Lucide Icons |
| **State** | Zustand |
| **Storage** | SQLite WASM, OPFS VFS, IndexedDB |
| **Computation** | Rust, WebAssembly |
| **Markdown** | react-markdown, Shiki, rehype-highlight |
| **Charts** | Chart.js, react-chartjs-2 |
| **Testing** | Vitest, Playwright, Testing Library |

### Key Features by Phase

- **Phase 1**: Basic file system access and AI conversation
- **Phase 2**: Plugin system and WASM integration
- **Phase 3**: Conversation threading, code intelligence, data visualization
- **Phase 4**: Workspace management, theming, keyboard shortcuts

---

## Architecture

### Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Presentation Layer                       │
│  React Components (UI, ConversationPanel, ToolsPanel)       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      State Management                        │
│  Zustand Stores (conversation, workspace-preferences, theme)  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Business Logic                          │
│  Hooks, Services, Tool Registry, Agent Intelligence         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Data Access                             │
│  SQLite Repositories, OPFS Cache, File System Access API    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Storage Layer                           │
│  SQLite WASM, OPFS VFS, IndexedDB (fallback)                │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### AI Agent System
- **Tool Registry**: Central registry for all available tools
- **Message Types**: Type definitions for messages and threads
- **Thread Utils**: Utilities for conversation threading
- **Intelligence Coordinator**: Coordinates tool selection and execution

#### Storage Layer
- **SQLite Database**: Main database with OPFS VFS persistence
- **Repositories**: Data access layer for conversations, skills, plugins
- **Migration**: Automatic IndexedDB to SQLite migration
- **OPFS Cache**: Intelligent file content caching

#### UI Components
- **Layout System**: Resizable panels with layout persistence
- **Conversation**: Threading, streaming, tool call display
- **File Viewer**: Syntax highlighting, file comparison
- **Data Visualization**: Charts, data preview
- **Workspace**: Theme, settings, keyboard shortcuts

---

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 8+ (recommended)
- Rust 1.75+ (for WASM development)
- A modern browser (Chrome/Edge recommended)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/nutstore/creatorweave.git
cd creatorweave

# Install dependencies
pnpm install

# Set up Git hooks (optional)
pnpm run setup-hooks
```

### Development Server

```bash
# Start the development server
pnpm run dev

# The app will be available at http://localhost:5173
```

### WASM Development

```bash
# Build WASM modules
cd wasm
wasm-pack build --target web --out-dir ../web/public/wasm crates/wasm-bindings

# Or use the convenience script
pnpm run build:wasm
```

### Reset Local SQLite/OPFS Data (Development)

When storage schema changes during local development, reset local browser data before retesting.

Option 1: Console reset (recommended)

```js
await window.__resetSQLiteDB()
location.reload()
```

Option 2: Browser storage reset

1. Open DevTools -> Application -> Storage.
2. Clear site data for `http://localhost:5173`.
3. Reload the app.

---

## Project Structure

```
creatorweave/
├── web/                          # Main web application
│   ├── src/
│   │   ├── agent/               # AI agent system
│   │   │   ├── tools/           # Tool implementations
│   │   │   ├── prompts/         # AI prompt templates
│   │   │   ├── message-types.ts # Message & thread types
│   │   │   ├── thread-utils.ts  # Threading utilities
│   │   │   └── tool-registry.ts # Tool registry
│   │   ├── components/          # React components
│   │   │   ├── agent/           # Conversation components
│   │   │   ├── batch-operations/# Batch operations UI
│   │   │   ├── code-viewer/     # File comparison
│   │   │   ├── data/            # Data visualization
│   │   │   ├── file-viewer/     # File tree, preview
│   │   │   ├── layout/          # Layout components
│   │   │   ├── settings/        # Settings dialogs
│   │   │   ├── skills/          # Skills management
│   │   │   ├── tools/           # Tools panel
│   │   │   ├── ui/              # Base UI components
│   │   │   └── workspace/       # Workspace management
│   │   ├── hooks/               # Custom React hooks
│   │   ├── opfs/                # OPFS cache layer
│   │   ├── python/              # Python integration
│   │   ├── services/            # Business logic services
│   │   ├── sqlite/              # SQLite database layer
│   │   │   ├── repositories/    # Data repositories
│   │   │   └── migrations/      # Database migrations
│   │   ├── store/               # Zustand stores
│   │   ├── types/               # TypeScript types
│   │   └── utils/               # Utility functions
│   ├── tests/                   # Test files
│   │   ├── e2e/                 # E2E tests
│   │   └── unit/                # Unit tests
│   ├── index.html               # Entry HTML
│   ├── package.json             # Dependencies
│   ├── tsconfig.json            # TypeScript config
│   ├── vite.config.ts           # Vite config
│   └── tailwind.config.js       # Tailwind config
├── wasm/                        # Rust + WebAssembly
│   ├── crates/
│   │   ├── core/                # Core Rust library
│   │   ├── wasm-bindings/       # WASM bindings
│   │   └── plugin-api/          # Plugin API
│   └── scripts/                 # Build scripts
├── packages/                    # Shared packages
│   ├── config/                  # Shared configuration
│   ├── encryption/              # Encryption utilities
│   ├── i18n/                    # Internationalization
│   └── ui/                      # Shared UI components
├── relay-server/                # Remote session server
└── mobile-web/                  # Mobile web interface
```

---

## Adding New Tools

### Tool Definition

Tools are defined in `/web/src/agent/tools/` and registered in `tool-registry.ts`.

### Tool Template

```typescript
// /web/src/agent/tools/my-tool.ts

import type { Tool, ToolContext, ToolResult } from '../tool-registry';

interface MyToolParams {
  param1: string;
  param2?: number;
}

export const myTool: Tool<MyToolParams> = {
  name: 'my_tool',
  description: 'Description of what this tool does',
  category: 'analysis', // or 'code', 'file', 'search', etc.

  parameters: {
    param1: {
      type: 'string',
      required: true,
      description: 'Description of param1'
    },
    param2: {
      type: 'number',
      required: false,
      description: 'Description of param2',
      default: 10
    }
  },

  async execute(params: MyToolParams, context: ToolContext): Promise<ToolResult> {
    try {
      // Tool implementation here
      const result = await doSomething(params.param1, params.param2);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

### Registering a Tool

```typescript
// /web/src/agent/tool-registry.ts

import { myTool } from './tools/my-tool';

export function getToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Register your tool
  registry.register(myTool);

  return registry;
}
```

### Tool Context

The `ToolContext` provides access to:

```typescript
interface ToolContext {
  // Directory handle for file access
  directoryHandle: FileSystemDirectoryHandle;

  // OPFS cache for file contents
  opfsCache: OpfsCache;

  // SQLite database access
  database: SQLiteDatabase;

  // Streaming callbacks for progress updates
  onProgress?: (message: string) => void;

  // Signal for cancellation
  signal?: AbortSignal;
}
```

### Best Practices

1. **Error Handling**: Always wrap in try-catch and return appropriate error messages
2. **Validation**: Validate all parameters before execution
3. **Progress Updates**: Use `onProgress` for long-running operations
4. **Caching**: Use OPFS cache for file reads when possible
5. **Type Safety**: Define strict parameter and result types

---

## Testing Guide

### Unit Tests

Located in `/web/src/**/__tests__/` directories.

#### Running Unit Tests

```bash
# Run all tests
pnpm run test

# Run tests in watch mode
pnpm run test:watch

# Run tests with UI
pnpm run test:ui

# Run tests with coverage
pnpm run test:coverage
```

#### Writing Unit Tests

```typescript
// /web/src/agent/tools/__tests__/my-tool.test.ts

import { describe, it, expect, vi } from 'vitest';
import { myTool } from '../my-tool';

describe('myTool', () => {
  it('should process valid input', async () => {
    const context = createMockContext();
    const result = await myTool.execute(
      { param1: 'test' },
      context
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should handle errors gracefully', async () => {
    const context = createMockContext();
    const result = await myTool.execute(
      { param1: null },
      context
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### E2E Tests

Located in `/web/e2e/` directory.

#### Running E2E Tests

```bash
# Run E2E tests
pnpm run test:e2e

# Run E2E tests with UI
pnpm run test:e2e:ui

# Run E2E tests in debug mode
pnpm run test:e2e:debug
```

#### Writing E2E Tests

```typescript
// /web/e2e/basic-flow.spec.ts

import { test, expect } from '@playwright/test';

test('basic conversation flow', async ({ page }) => {
  await page.goto('/');

  // Select folder
  await page.click('button:has-text("Select Folder")');

  // Send message
  await page.fill('[data-testid="chat-input"]', 'Hello, AI!');
  await page.press('[data-testid="chat-input"]', 'Enter');

  // Assert response
  await expect(page.locator('[data-testid="message-bubble"]')).toBeVisible();
});
```

### Test Coverage Goals

- **Unit Tests**: 80%+ coverage for business logic
- **E2E Tests**: Cover critical user flows
- **Component Tests**: Test interactive components

---

## Build and Deploy

### Building for Production

```bash
# Build WASM modules
pnpm run build:wasm

# Build web application
pnpm run build

# Output in web/dist/
```

### Production Build Artifacts

```
web/dist/
├── assets/              # JS, CSS bundles
│   ├── index-[hash].js
│   └── index-[hash].css
├── wasm/                # WASM modules
└── index.html           # Entry HTML
```

### Deployment

#### Static Hosting (Vercel, Netlify, GitHub Pages)

```bash
# Build and deploy to Vercel
vercel --prod

# Build and deploy to Netlify
netlify deploy --prod

# Build for GitHub Pages
pnpm run build:gh-pages
```

#### Self-Hosted

1. Build the application: `pnpm run build`
2. Serve `web/dist/` with any static file server
3. Configure COOP/COEP headers for OPFS support

### Environment Variables

```bash
# .env.production
VITE_API_ENDPOINT=https://api.example.com
VITE_APP_NAME=CreatorWeave
VITE_ENABLE_ANALYTICS=false
```

---

## Code Style Guidelines

### TypeScript

- Use strict mode: `"strict": true` in tsconfig.json
- Prefer `interface` over `type` for object shapes
- Use `type` for unions, intersections, primitives
- Avoid `any` - use `unknown` with type guards
- Use readonly for immutable arrays/objects

```typescript
// Good
interface User {
  readonly id: string;
  name: string;
  email: string;
}

function process(data: unknown): data is User {
  // Type guard implementation
}

// Avoid
function process(data: any): any {
  // ...
}
```

### React

- Use functional components with hooks
- Prefer composition over inheritance
- Use TypeScript for props
- Keep components small and focused
- Use `React.memo` for expensive components

```typescript
// Good
interface MyComponentProps {
  title: string;
  onAction: () => void;
}

export const MyComponent: React.FC<MyComponentProps> = React.memo(({
  title,
  onAction
}) => {
  return (
    <div>
      <h1>{title}</h1>
      <button onClick={onAction}>Action</button>
    </div>
  );
});
```

### CSS/Tailwind

- Use Tailwind utility classes
- Use `@apply` for repeated patterns
- Use `cn()` utility for conditional classes
- Use semantic color tokens from theme

```tsx
// Good
import { cn } from '@/lib/utils';

<div className={cn(
  "flex items-center gap-2 p-4 rounded-lg",
  isActive && "bg-primary text-primary-foreground",
  className
)}>
```

### File Naming

- Components: PascalCase (e.g., `MyComponent.tsx`)
- Hooks: camelCase with `use` prefix (e.g., `useMyHook.ts`)
- Utilities: camelCase (e.g., `myUtil.ts`)
- Types: PascalCase for interfaces/types (e.g., `MyType.ts`)
- Tests: `.test.ts` or `.spec.ts` suffix

### Comments

- Use JSDoc for exported functions
- Comment complex logic
- Keep comments up to date
- Use English for all comments

```typescript
/**
 * Processes a file and returns statistics.
 * @param filePath - Path to the file to process
 * @param options - Processing options
 * @returns File statistics including line count, size, etc.
 * @throws {Error} If file cannot be read
 */
export async function processFile(
  filePath: string,
  options: ProcessOptions
): Promise<FileStats> {
  // Implementation...
}
```

### Git Commit Messages

Follow conventional commits:

```
feat: add batch edit tool
fix: resolve memory leak in file cache
docs: update user guide
refactor: simplify tool registry
test: add tests for thread utils
chore: update dependencies
```

---

## Additional Resources

### Internal Documentation

- [Conversation Threading](./web/THREADING_IMPLEMENTATION.md)
- [Batch Operations](./BATCH_OPERATIONS_IMPLEMENTATION.md)
- [Phase 4 Implementation](./web/PHASE4_IMPLEMENTATION_SUMMARY.md)
- [SQLite Storage](./web/src/sqlite/README.md)

### External Resources

- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Zustand Guide](https://github.com/pmndrs/zustand)
- [Vite Guide](https://vitejs.dev/guide/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [SQLite WASM](https://sqlite.org/wasm)

---

**Last Updated**: 2025-02-08
**Version**: 0.2.0
