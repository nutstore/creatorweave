# Composite Disk Executor Design

## Goal

Allow a single project to contain both browser File System Access roots and Native Host roots. Extension availability alone must never change an existing root's backend.

## Root identity

`project_roots` is the source of truth for each root's authorization backend:

| Field | FS Access root | Native Host root |
| --- | --- | --- |
| `backend` | `fsaccess` | `native-host` |
| `scope_id` | `NULL` | persistent `scope_xxx` |
| disk root ID | `projectId:rootName` | `scope_xxx` |
| browser handle | present or recoverable | always `NULL` |

Existing records migrate to `backend = 'fsaccess'` and `scope_id = NULL`.

## Execution routing

`CompositeExecutor` owns an FS Access executor and, when the bridge exists, a Native Host executor. It routes compound IDs to FS Access and `scope_` IDs to Native Host. A Native Host call failure is returned as a failure; it must not fall back to FS Access because same display names can refer to different directories.

## Authorization lifecycle

Folder selection has explicit Browser and Native Host actions. The chosen action determines the persisted backend. Loading roots hydrates the backend saved in SQLite instead of matching host scopes by display name. Removing a Native Host root revokes the host scope first; if revocation fails, the local record remains so the UI does not claim the authorization is gone.

## Runtime path handling

FS Access's handle identity lookup remains for legacy calls. Workspace path resolution must also return the persisted disk root ID. Native Host roots operate through that ID and never require a fabricated `FileSystemDirectoryHandle`. Read, write, delete, pending sync, and conflict detection use the resolved ID for executor calls.

## Verification

Tests cover legacy migration, executor routing, no fallback from failed Native Host calls, Native Host root authorization persistence, and a Native Host root sync/conflict path without a browser handle. TypeScript and focused lint checks must pass.
