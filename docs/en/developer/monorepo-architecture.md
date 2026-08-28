---
title: Monorepo Architecture and Boundaries
order: 204
---

# Monorepo Architecture and Boundaries

This document focuses on workspace layout, package dependencies, and "where code should go".
For the system-level runtime flow, also read the [Architecture Overview](./architecture-overview.md).

## 1. Workspace Structure

The workspace currently consists of:

1. `web`: the desktop main app.
2. `packages/*`: shared packages.

`pnpm-workspace.yaml` stays consistent with the root `package.json`; everything is developed together through the workspace, with no independent release process required.

## 2. Shared Package Responsibilities

### 2.1 `packages/config`

1. Exports Tailwind, TypeScript, ESLint, and Design Token configurations.
2. Configuration exports only; no business logic.

### 2.2 `packages/ui`

1. General-purpose UI components (based on Radix).
2. Built for reuse across apps; avoid coupling in business state.

### 2.3 `packages/conversation`

1. Conversation display components and types.
2. Stays "presentation first"; avoid introducing business-side store dependencies.

### 2.4 `packages/encryption`

1. Encryption utility capabilities (key exchange, encryption/decryption wrappers).
2. Keep protocol changes compatible with their consumers.

### 2.5 `packages/i18n`

1. Multilingual resources and hooks.
2. A cross-app foundation capability for the UI layer.

## 3. App and Service Boundaries

### 3.1 `web`

1. Business core: Agent, MCP, plugin system, SQLite/OPFS, file and session management.
2. Principle: business state goes into `store/`; heavy computation sinks into `services/` or `workers/`.

## 4. Dependency Direction Constraints

Allowed directions:

1. `web` -> `packages/*`
2. Inside `web`: `components` -> `store` -> `services`/`agent`/`mcp` -> `sqlite`/`opfs`

Directions to avoid:

1. `packages/*` depending backwards on application-layer code.
2. UI components calling low-level repositories or protocol layers directly.
3. Application-layer code duplicating shared package implementations instead of reusing protocols/shared packages.

## 5. Development Command Conventions

Prefer `pnpm -C <workspace>` to scope commands explicitly:

```bash
# Desktop
pnpm -C web dev
pnpm -C web lint
pnpm -C web typecheck

```

For cross-project commands use the root `Makefile` (e.g. `make lint`, `make test`).

## 6. Documentation Index

1. System flow: [`docs/zh/developer/architecture/overview.md`](https://github.com/nutstore/creatorweave/blob/main/docs/zh/developer/architecture/overview.md)
2. Plugin system and other internal design docs: see the separate `weave-docs` repository (`plugin-system/`)

---

Last updated: 2026-02-28
