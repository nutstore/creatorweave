# Composite Disk Executor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one project workspace to use File System Access and Native Host roots concurrently, with each native disk operation routed by its persisted root identity.

**Architecture:** Persist a root's backend and optional Native Host scope ID in `project_roots`. A `CompositeExecutor` owns both concrete executors and chooses one from the root ID. Workspace path resolution yields the persisted disk root ID so native-host roots never require a synthetic `FileSystemDirectoryHandle`.

**Tech Stack:** TypeScript, Zustand, SQLite migrations/repositories, File System Access API, Chrome Native Messaging, Vitest.

---

### Task 1: Persist root backend identity

**Files:**
- Modify: `src/sqlite/migrations/index.ts`
- Modify: `src/sqlite/sqlite-schema.sql`
- Modify: `src/sqlite/repositories/project-root.repository.ts`
- Modify: `src/types/folder-access.ts`
- Test: `src/sqlite/migrations/index.test.ts`

- [ ] Add a migration that gives all existing roots `backend = 'fsaccess'` and `scope_id = NULL`.
- [ ] Extend repository inputs, rows, mapping, insert, and update queries with `backend` and nullable `scopeId`.
- [ ] Verify repository loading preserves legacy FS Access roots and Native Host scope IDs.

### Task 2: Route operations by root ID

**Files:**
- Create: `src/opfs/native-disk/executor-composite.ts`
- Modify: `src/opfs/workspace/workspace-manager.ts`
- Test: `src/opfs/native-disk/__tests__/executor-composite.test.ts`

- [ ] Create a failing test proving `scope_*` routes to Native Host and compound keys route to FS Access.
- [ ] Implement `CompositeExecutor` by delegation, including combined root listing.
- [ ] Change workspace creation to always use FS Access, optionally adding Native Host when the bridge exists.
- [ ] Verify Native Host failures do not fall through to a same-named FS Access root.

### Task 3: Add explicit root authorization choices

**Files:**
- Modify: `src/store/folder-access.store.ts`
- Modify: `src/components/layout/FolderSelector.tsx`
- Modify: `src/types/folder-access.ts`
- Test: `src/store/__tests__/folder-access.store.test.ts`

- [ ] Split root creation into FS Access and Native Host paths while preserving current `addRoot()` callers as FS Access.
- [ ] Persist Native Host roots with `backend = 'native-host'`, null browser handles, and the returned `scopeId`.
- [ ] Hydrate each root using its persisted backend; never infer a Native Host root by display name.
- [ ] Revoke Native Host authorization before deleting its database row, retaining the row if host revocation fails.
- [ ] Expose an explicit Native Host action in FolderSelector only when the bridge is available.

### Task 4: Use persisted root IDs in WorkspaceRuntime

**Files:**
- Modify: `src/opfs/workspace/workspace-runtime.ts`
- Modify: `src/opfs/workspace/workspace-pending.ts`
- Test: `src/opfs/workspace/__tests__/workspace-runtime-native-handle-scope.test.ts`
- Test: `src/opfs/workspace/__tests__/workspace-runtime-native-root.test.ts`

- [ ] Preserve handle identity lookup for FS Access roots.
- [ ] Add resolved root metadata that includes the persisted disk root ID and optional browser handle.
- [ ] Update read/write/delete/sync/conflict paths to call the executor with that ID rather than requiring a handle for Native Host roots.
- [ ] Add a Native Host root test that proves sync and conflict detection use its scope ID without a `FileSystemDirectoryHandle`.

### Task 5: Verify the integration

**Files:**
- Modify only as required by failures from Tasks 1–4.

- [ ] Run focused migration, repository, executor, store, and workspace tests.
- [ ] Run `pnpm exec tsc --noEmit` from `web`.
- [ ] Run relevant ESLint checks.
- [ ] Run `pnpm build:extension` from `web` after the Native Messaging relay change and report any environment permission blocker.
