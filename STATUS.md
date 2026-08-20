# Native Host Filesystem Capability — Architecture & Status

> **Goal**: When the user installs the Native Host, directory authorization and disk file I/O
> go through the Native Host (Chrome Native Messaging) instead of the File System Access API.
> The OPFS pending/sync/conflict-detection machinery is fully preserved; the Native Host acts
> only as the "disk executor".

---

## 1. Architecture

### 1.1 File I/O decoupling

```
Agent tools (read/write/edit/ls/search/bash)
        ↓ VfsBackend (uniform contract)
WorkspaceBackend → useOPFSStore → WorkspaceRuntime
                                    ↓
                  ┌─────────────────┴─────────────────┐
                  ↓ OPFS cache (unchanged)            ↓ native disk layer (executor)
            this.workspaceDir                  DiskExecutor (FSAccess | NativeHost)
            files/ .baseline/ workspace.json
```

### 1.2 `DiskExecutor` abstraction

```typescript
export type DiskBackend = 'fsaccess' | 'native-host'

export interface DiskRoot {
  readonly id: string          // FSAccess: compoundKey | NativeHost: scope_id
  readonly displayName: string
  readonly readOnly: boolean
  readonly backend: DiskBackend
  readonly permissions: readonly ('read' | 'write' | 'search')[]
}

export interface DiskExecutor {
  // authorization
  listRoots(projectId: string): Promise<DiskRoot[]>
  authorizeRoot(projectId: string, opts?): Promise<DiskRoot | null>
  revokeRoot(projectId: string, rootId: string): Promise<void>
  hydrateRoot(projectId: string, rootId: string): Promise<boolean>
  // disk execution
  read(rootId: string, relativePath: string): Promise<{ content: Uint8Array; stat: DiskStat }>
  write(rootId: string, relativePath: string, content: string | Uint8Array): Promise<{ stat: DiskStat }>
  delete(rootId: string, relativePath: string): Promise<void>
  stat(rootId: string, relativePath: string): Promise<DiskStat | null>
  listDir(rootId: string, relativePath: string): Promise<DiskEntry[]>
}
```

Two implementations:

| Implementation | File | Source |
|---|---|---|
| `FSAccessExecutor` | `executor-fsaccess.ts` | Wraps `FileSystemDirectoryHandle` |
| `NativeHostExecutor` | `executor-native-host.ts` | Calls `window.__agentWeb.nativeHostCall` |
| `CompositeExecutor` | `executor-composite.ts` | Routes by `rootId` shape (`scope_*` → NativeHost, `projectId:rootName` → FSAccess) |

### 1.3 Native Messaging chunked protocol

```
Chrome NM hard limit per message: 1,048,576 bytes (1 MB)
Chunk size: 512 KB raw → ~666 KB base64 → ~667 KB with envelope → safe margin
Threshold: ≤ 512 KB single read_file / write_file; > 512 KB chunked read_file_at / write_file_at
```

Chunked read/write use `offset`-based `read_file_at` / `write_file_at` actions with
`truncate`/`finalize` flags; retries overwrite the same offset (idempotent).

### 1.4 Rust actions

| Area | Actions |
|---|---|
| Scope management | `ping`, `list_scopes`, `pick_folder`, `remove_scope` |
| File I/O | `stat_file`, `list_dir`, `read_file`, `read_file_at`, `write_file`, `write_file_at`, `delete_file` |
| Command execution | `check_policy`, `exec_sync`, `get_execpolicy`, `set_execpolicy` |
| Process management | `exec_start`, `exec_logs`, `exec_status`, `exec_stop`, `exec_list` |

Base64 codec is dependency-free; every action reuses `scope::resolve_safe_relative`
for path-traversal protection.

---

## 2. Security model

- Web/agent never sees the real disk path — only an opaque `scope_id`.
- Real path mapping lives only host-side in `~/.creatorweave/native-host-scopes.json`.
- Four layers of defense:
  1. Extension action allow-list + field allow-list forwarding
  2. Web tool layer rejects absolute paths
  3. Host-side `canonicalize` + `starts_with` path-traversal guard
  4. Search results re-validated against scope

---

## 3. Status overview

| Capability | Status |
|---|---|
| DiskExecutor abstraction + FSAccessExecutor | ✅ Done |
| NativeHostExecutor + chunked protocol | ✅ Done (e2e verified) |
| CompositeExecutor routing | ✅ Done |
| Authorization UI (native-host badge, Cable icon + tooltip) | ✅ Done |
| Command execution (`exec_sync` + `ExecAuthModal` + `ExecPolicy`) | ✅ Done (auto/prompt/forbidden verified) |
| ExecPolicy management UI (settings panel "执行策略" tab) | ✅ Done |
| Background process management (`processes` tool) | ✅ Done |
| Auto-flush pending before exec | ✅ Done |
| Windows support | ❌ Not done (macOS only) |
| Code signing / notarization (Gatekeeper) | ❌ Not done |

---

## 4. Roadmap

| Tier | Scope | Status |
|---|---|---|
| Tier 1 | Pure file-I/O agent (browser file editing) | ✅ Done |
| Tier 1.5 | Controlled command execution (transparent + approval, no fake sandbox) | ✅ Done |
| Tier 2 | Full sandboxed exec (OS-level isolation — Docker/Seatbelt/VM) | ❌ Future (needs independent design) |
| Tier 3 | Full coding agent (PTY + long-lived + file watching, Codex/Devin-class) | ❌ Future |

> **Principle**: tiers are architectural boundaries, not feature flags. Command execution
> must be built on containerization/virtualization if moving beyond Tier 1.5 — never bolted
> onto the plain file-I/O native host.

---

## 5. Config files

| File | Purpose |
|---|---|
| `~/.creatorweave/native-host-scopes.json` | Authorized scope → real path mapping |
| `~/.creatorweave/execpolicy.json` | Command allow/deny rules (forbidden > auto > prompt > default) |
| `~/.creatorweave/processes.json` | Managed background process registry |
| `~/.creatorweave/logs/{id}.log` | Background process stdout/stderr |

---

## 6. Tracking — open items

### Command execution

- [ ] `exec` auto-flush: apply the same flush pipeline to `exec_start` (background processes)

### Cross-platform & hardening

- [ ] Windows support (`CREATE_NEW_PROCESS_GROUP` + `taskkill /T`) — currently macOS only
- [ ] Code signing / notarization (macOS Gatekeeper)

### Conversation sharing (待追踪)

- **Request**: a user (ticket #480096) asked for a "share link" for a single AI conversation.
- **Constraint**: CreatorWeave is currently local-first; no online share link is possible.
- **Judgment**: likely a broadly useful request; needs a feasible implementation plan.
- **Status**: 🔵 Tracking / to be evaluated

Candidate directions (evaluate, no conclusion yet):

- [ ] Self-contained export (single HTML/zip with embedded images)
- [ ] Temporary share link via cloud storage (file-based, Nutstore relay)
- [ ] One-time-token backend (requires server-side storage + lifecycle/expiry)
- [ ] Peer-to-peer encrypted share (p2p / one-time key)

---

## 7. References

- First POC patch: `experiment-native-host-e3d2221.patch` (Rust native host base)
- PR #6: Node.js bridge daemon (task delegation, shared extension ID)
- Extension ID: `kdnnhmagmghdhfinoipgbcddnpmffbkp`
- Native host name: `com.creatorweave.nativehost`
