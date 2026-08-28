---
title: Architecture Overview
order: 201
---

# CreatorWeave Architecture Overview

> This document is based on the current repository code (`master`). Its goal is to give developers an actionable system map: module boundaries, key data flows, startup paths, and troubleshooting entry points.

## 1. System Topology

The repository is a `pnpm workspace` monorepo. The core runtime units are:

1. `web/`: the desktop main app (React + Vite + Zustand + SQLite WASM + OPFS).
2. `relay-server/`: relay server (Express + Socket.IO) handling session forwarding and the session sync API.
3. `packages/*`: shared capability packages (`ui`, `conversation`, `encryption`, `i18n`, `config`).
4. `wasm/`: Rust/WASM modules (invoked by the `web` build pipeline).

## 2. Frontend Main App (web) Layering

The core layering of `web/src` can be understood as "UI -> Store -> services/runtime -> persistence/external protocols":

1. UI layer: `components/`, `hooks/`, `styles/`.
2. State layer: `store/` (Zustand) — sessions, workspace, settings, remote state, etc.
3. Runtime layer:
   `agent/`: AgentLoop, context management, tool system, LLM providers.
   `mcp/`: MCP manager, tool bridge, elicitation handling.
   `python/`: Pyodide execution bridge.
   `services/`: plugin loading/execution/monitoring, file discovery, streaming reads, etc.
4. Data layer:
   `sqlite/`: SQLite WASM worker + repositories.
   `opfs/`: OPFS session/undo/cache capabilities.
   `storage/`: storage initialization and fallback strategy at app startup.
5. Parallel layer: `workers/` (file discovery, plugin host, diff and other heavy tasks).

## 3. Startup Flow (Desktop)

Entry: `web/src/main.tsx` -> `web/src/App.tsx`

Initialization order (critical path):

1. `initStorage()` initializes SQLite (OPFS preferred, fallback available on failure).
2. `setupAutoSave()` registers storage finalization logic.
3. `workspace.store.initialize()` loads the workspace context.
4. `remote.store.attemptReconnect()` tries to restore remote sessions.
5. `settings.store.checkHasApiKey()` warms up API key state.
6. Triggered after the first user interaction:
   Request Persistent Storage.
   Restore pending directory handles if any exist.

Error handling:

1. `DATABASE_INACCESSIBLE` triggers a dedicated refresh dialog.
2. Storage initialization errors surface in the UI with a "reset database" path.

## 4. Agent Execution Path

The main chain lives in `conversation.store.sqlite.ts`:

1. Conversation messages are written to the session store.
2. Each conversation holds its own `AgentLoop` instance (not a global singleton).
3. `AgentLoop` invokes `ContextManager` + `ToolRegistry` + the LLM provider.
4. Tool-call events are pushed to the UI via `streaming-bus` (thinking/tool/status).
5. Conversation results are persisted to SQLite; runtime fields (streaming intermediate state) are not persisted.

Key facts:

1. Conversation persistence and runtime state are separate by design.
2. Thread/fork/merge style threaded conversation operations are supported.
3. MCP elicitation (e.g. binary upload) is handled by `mcp/elicitation-handler.tsx`.

## 5. Three Extension Paths: MCP, Plugins, Python

### 5.1 MCP

1. `MCPManager` handles server config CRUD, connection lifecycle, and tool discovery caching.
2. `MCPClientService` handles protocol communication (including task polling).
3. `mcp-tool-bridge` registers MCP tools into the Agent ToolRegistry.
4. `mcp-injection` generates the available-MCP-servers block in the system prompt.

### 5.2 Plugin System

1. `PluginLoaderService` loads plugins in a Worker and establishes instances.
2. `PluginExecutorService` handles parallel execution and progress callbacks.
3. `PluginResultAggregator` aggregates multi-plugin results.
4. `PluginMonitorService` does resource monitoring and violation logging.
5. `PluginStreamService` handles chunked processing for large files.
6. UI rendering is handled by `PluginResultRenderer` and the Plugin API (`PluginHostAPI`).

### 5.3 Python (Pyodide)

1. `web/src/python/*` provides the in-browser Python execution entry.
2. During build, `web` copies pyodide assets into the output directory.
3. Agent tools can invoke Python computation and file processing through the bridge.

## 6. Remote Sessions (Desktop <-> Relay <-> Mobile)

1. The desktop creates/restores sessions via `RemoteSession`.
2. Both ends use `@creatorweave/encryption` for key exchange and message encryption.
3. `relay-server` only forwards and manages sessions; it never performs business decryption.
4. `relay-server` exposes:
   `GET /health` health check.
   `/api/*` session sync endpoints.
   `GET /join/:sessionId` redirect to the mobile page.

## 7. Data Persistence and Fallback Strategy

Current storage modes (`storage/init.ts`):

1. `sqlite-opfs`: the default target mode.
2. `indexeddb-fallback`: fallback when SQLite initialization fails.
3. `sqlite-memory`: type kept for restricted-scenario extensions.

Persisted objects:

1. Sessions, skills, plugins, workspaces, change records etc. go into SQLite.
2. Directory handles are stored in a separate IndexedDB (structured clone).
3. File-system entity reads/writes go through the File System Access API / OPFS.

Native directory-handle scope constraints (hard rules):

1. Directory handles may only be bound at the `projectId` level.
2. A `workspace` may not hold or bind a directory handle on its own.
3. All workspaces under the same `project` share the same local directory handle.
4. After a `project` directory handle is released, all of its workspaces must be treated as "no local directory".

## 8. Development and Quality Gates

Daily quality commands (mostly `web`):

```bash
pnpm -C web lint
pnpm -C web typecheck
pnpm -C web test
pnpm -C web test:e2e
```

Common cross-project commands:

```bash
pnpm -C relay-server dev
make lint
make test
```

## 9. Design Constraints and Recommendations

1. New capabilities should go through `services/` + `store/` first; avoid piling business logic into components.
2. Cross-module protocols (Remote/MCP/Plugin) must define types before implementing transport.
3. Any persistence change should go through `sqlite/repositories`; do not build SQL in the UI layer.
4. Conversation runtime state stays out of the database to keep streaming intermediates out of history.
5. Worker boundaries are preferred for high-frequency CPU-intensive tasks (diff, traversal, plugin execution).

## 10. Structural Evolution (Landed)

The Project / Workspace two-layer structure has landed together with multi-root workspace support. Design details live in the internal `weave-docs` repository (`design/multi-root-project.md`).

---

Last updated: 2026-02-28
