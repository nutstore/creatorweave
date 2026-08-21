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
| Windows support | 🚧 Implemented (cross-compiled exe OK; real-machine e2e pending, §8) |
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

- [ ] Windows support — implemented 2026-08-20, design & decisions in §8:
  - [x] `Cargo.toml`: objc2 gated to macOS; `windows` crate 0.62 (windows-only, needs COM interfaces)
  - [x] `pick_folder`: IFileDialog COM (`FOS_PICKFOLDERS`) in `win.rs`
  - [x] `process_registry`: `pid_alive` via `OpenProcess` + `GetExitCodeProcess`; registry lock via `LockFileEx`; unix imports cfg-gated (was a hard compile error)
  - [x] `exec_start`: `CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW` + `taskkill /T` rollback
  - [x] `exec_stop`: `kill_group` → `taskkill /PID <pid> /T` (+ `/F` when force)
  - [x] `shell_env`: Windows short-circuit (empty map — Windows Chrome passes full env)
  - [x] Windows command resolution: `resolve_command` PATH×PATHEXT helper applied after policy check in exec/exec_sync/exec_start
  - [x] execpolicy: Windows shells forbidden (`cmd`/`powershell`/`pwsh`/`wsl`/`taskkill`/…); old policy files auto-upgraded with missing Forbidden defaults
  - [x] `install.ps1` / `uninstall.ps1` (HKCU registry, no admin) + README
  - [x] Single-file installer: `installer/build-installer.sh` → 7z GUI SFX (~460 KB), builds on ANY host OS (NSIS rejected: Homebrew arm64 makensis crashes with std::bad_alloc even on empty scripts). Installs to `%LOCALAPPDATA%\EO2Weave\`, HKCU registration, Add/Remove entry, embedded uninstaller.
  - [x] Verified: `cargo check`/`build --release --target x86_64-pc-windows-gnu` clean (PE32+ exe produced); macOS `cargo test` 27/27 green
  - [ ] Real Windows e2e: pick_folder → read/write → exec → exec_start/stop on an actual Windows machine
  - [ ] CI: add windows target to the build matrix (msvc or gnu)
- [ ] Code signing / notarization (macOS Gatekeeper)
- [x] **macOS pkg installer** (2026-08-21): `installer/build-installer-pkg.sh` → system-level `.pkg` (universal aarch64+x86_64, ~650 KB). Double-click + admin once. Installs binary to `/Library/Application Support/EO2Weave NativeHost/NativeMessagingHosts/`, static NM manifests for Chrome (`/Library/Google/Chrome/NativeMessagingHosts/`) + Edge, embedded `uninstall.sh`. Strips `com.apple.quarantine` pre-pkgbuild (Gatekeeper would kill the NM child); residual `._` AppleDouble entries come from system-protected `com.apple.provenance` only — harmless, Chrome ignores it. `install.sh` remains the dev alternative (manifest → `target/release`). Test: `sudo installer -pkg … -target /`; the pkg exists at `installer/EO2Weave-Host-Setup-1.2.0-macos.pkg` (verified payload tree + universal binary + 0 quarantine entries).

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

---

## 8. Windows support — design (2026-08-20, in progress)

> Scope: host-side Rust only. The web executor layer (`executor-native-host.ts`), extension relay
> (`background.ts`), and NM protocol (`nm.rs`) are fully platform-agnostic — verified by grep, no
> changes needed there. Everything below happens inside `browser-extension/native-host/`.

### 8.1 What breaks on Windows today

| Module | Problem |
|---|---|
| `Cargo.toml` | `objc2*` deps are unconditional — macOS-only crates fail to build for `windows-*` targets |
| `process_registry.rs` | `use std::os::unix::fs::MetadataExt` / `AsRawFd` in `RegistryLock::acquire` have **no cfg gate** → compile error; `pid_alive` returns `false` always; `libc_flock` stub is a no-op (no locking) |
| `pick_folder.rs` | Non-macOS stub returns `None` → action always reports `cancelled` |
| `exec_start.rs` | `process_group(0)` is Unix-only; rollback `kill_group` is a no-op |
| `exec_stop.rs` | `kill_group` returns `false` → stop always fails for running procs |
| `shell_env.rs` | Tries `$SHELL`/`/bin/zsh` + `printenv` — silently fails (returns empty), acceptable but wasteful |
| All exec paths | `Command::new("pnpm")` fails on Windows: std resolves only `.exe`, not `.cmd`/`.bat`/`.com` shims — node/pnpm/git wrappers are `.cmd` |
| `install.sh` | Hardcodes `~/Library/.../NativeMessagingHosts`; Windows needs a registry key + `.exe` path |

### 8.2 Decisions

1. **Folder picker → IFileDialog COM.** Single folder pick, `FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM`, CoInitializeEx on the calling thread. Implemented via the `windows` crate (windows-sys has no COM interface definitions), behind `#[cfg(target_os = "windows")]` in the existing `mod platform`. Keeps the objc2-free dependency graph on Windows.
2. **pid liveness → `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` + `GetExitCodeProcess` != `STILL_ACTIVE`.** Replaces `kill(pid, 0)`. Conservative on access-denied (treated as alive).
3. **Registry lock → `LockFileEx` on the same `.lock` file** (exclusive + fail-fast, same retry/timeout loop as Unix). Replaces `flock`. Semantics equivalent: NM spawns one host process per message, races only occur between concurrent host processes.
4. **Detached spawn → `CREATE_NEW_PROCESS_GROUP` creation flag** (Job Objects deliberately not used: a job would kill children when the host exits — the opposite of the "dev server must survive" requirement). Detachment on Windows is the default (no handle inheritance without explicit `SECURITY_ATTRIBUTES.bInheritHandle`).
5. **Stop → `taskkill /PID <pid> /T`** (tree kill, graceful console-event first) **+ `/F` when force**. Mirrors SIGTERM→SIGKILL escalation. `std::process::Command` invoked internally; return-code based success check.
6. **Command resolution → resolve bare names against `PATH` + `PATHEXT` before spawning.** If `command[0]` contains no path separator, probe `PATH` entries × `PATHEXT` extensions (default `.COM;.EXE;.BAT;.CMD`), use the first hit; fall through unchanged when nothing matches (preserves today's error message). Implemented once in a shared helper (`win.rs::resolve_command`), applied by `exec_sync`, `exec`, `exec_start` — always AFTER the execpolicy check, so policy keeps matching the user-facing name (`pnpm`, not `...\pnpm.cmd`). Path-absolute commands (e.g. `C:\...`) skip resolution. Rust std ≥1.77 wraps `.cmd`/`.bat` spawns with `cmd.exe` (BatBadBut mitigation), so spawning the resolved `.cmd` is safe.
7. **shell_env → short-circuit on Windows** (`return HashMap::new()` immediately). Windows Chrome passes the user's full environment to NM hosts; the macOS launchd PATH problem doesn't exist. Also skip `.cmd`-spawned shells entirely.
8. **Execpolicy unchanged.** `cmd.exe`/`powershell.exe` are denied like `/bin/sh` on macOS (existing rules: command-name allow-list, no shell wrapping). `taskkill` and Windows toolchains (`node.exe`, `pnpm.cmd`, …) match by name as usual.
9. **Install → single-file setup exe via 7z GUI SFX** (`installer/build-installer.sh`; builds on any OS with cargo+7z+curl — the `7z.sfx` module is fetched once from 7-zip.org). Installs to `%LOCALAPPDATA%\EO2Weave\NativeMessagingHosts`, writes the manifest, registers `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.creatorweave.nativehost` (+ Edge), adds an Add/Remove-Programs entry with an embedded uninstaller. NSIS was the first choice but Homebrew's arm64 `makensis` crashes (`std::bad_alloc`) even on empty scripts; IExpress requires running packaging on Windows. HKCU only — no admin. `install.ps1` remains the manual/dev alternative (installs to `%LOCALAPPDATA%\CreatorWeave\`).
10. **Exit status**: Windows has no signals; `signal` stays `null` (already the `#[cfg(not(unix))]` behavior). Exit codes propagate as-is.
11. **`cfg` layout**: per-feature inline `#[cfg]` blocks (matches existing style — the codebase already uses `#[cfg(unix)]`/`#[cfg(not(unix))]` in place). No platform module split; a new `win.rs` helper module hosts `pid_alive`/`kill_tree`/`resolve_command`/`pick_folder` internals to keep actions readable.

### 8.3 Non-goals / later

- Linux support: everything in §8.2 is `#[cfg(windows)]`; Unix paths remain untouched, so Linux falls back to today's behavior (pick_folder stub, etc.). A Linux `pick_folder` (GTK/zenity) is future work.
- Authenticode signing of the `.exe` — same tier as macOS notarization (§6).
- ARM64 Windows (`aarch64-pc-windows-msvc`) — build target question, code is arch-agnostic.

### 8.4 Verification plan

- `cargo check --target x86_64-pc-windows-gnu` (done on macOS dev machine — works without a Windows toolchain; `build --release` also links via the gnu target if mingw is installed. MSVC target remains an option for CI.)
- `cargo test` on macOS must stay green (Unix paths untouched)
- New unit tests: `resolve_command` PATHEXT logic (pure logic, host-platform testable with a fake PATH), normalize/lock behavior where feasible
- Real Windows e2e (pick_folder → read/write → exec → exec_start/stop) after first real machine is available

---

## 19. Agent Bridge (MCP) — WebMCP tools for external CLI agents (2026-08-21, shipped)

> One binary, two roles. Chrome can only launch the native host via NM; external CLIs (Codex,
> Claude Code, Cursor) can't reach the browser directly. The bridge closes that gap.

### 19.1 Architecture

```
CLI (codex) ──MCP stdio (line-JSON JSON-RPC 2.0)── cw-native-host --mcp-stdio (helper role)
    helper ──TCP 127.0.0.1:<random>, line-JSON── daemon (cw-native-host, NM-spawned)
    daemon ──NM streaming── extension background (native-bridge.ts) ── invokeWebMCPTool / discovery
```

- Daemon: `actions/webmcp_bridge.rs` — first NM message `{action:"webmcp_bridge",stream:true}`
  starts it; binds 127.0.0.1:0, writes `~/.eo2weave/webmcp-bridge.json` (port/pid/binaryPath),
  relays per-line JSON between TCP clients and NM. Client ids are rewritten to unique reqIds
  (multiple helpers may share the daemon); NM stdin EOF → state file removed.
- Helper: `actions/mcp_stdio.rs` — `cw-native-host --mcp-stdio`. Reads the state file, connects,
  translates MCP `initialize`/`tools/list`/`tools/call`/`ping`. Daemon down → tools/list returns
  EMPTY list + `_meta.eo2weaveHint` (Codex still boots; user gets a hint instead of an error).
- Extension: `entrypoints/webmcp/native-bridge.ts` — connectNative port lifecycle, 60s keepalive
  ping, crash reconnect (only if it was running once), storage.local `webmcp_bridge_enabled`.
  tools/list = all-window discovery incl. registry-silent-tab fallback + per-host/group
  authorization filter (disabled sites don't exist externally either). tools/call resolves
  groupKey from the registry (invokeWebMCPTool routes by groupKey+fullToolName), then reuses the
  in-app invoke path — authorization gates identical to in-app calls.
- Popup: "Agent bridge (MCP)" switch + ready-to-copy `codex mcp add` / `claude mcp add`
  commands (binaryPath from daemon hello = current_exe).

### 19.2 Bugs found on the way (all fixed)

1. **Toggle wouldn't turn on (silent)**: start() connected the port but never sent the first NM
   message — main.rs dispatches on the FIRST message, so the host blocked in read_message and
   the JS startup timeout fired. Fix: postMessage({action,stream:true}) after listeners attach.
2. **Toggle flip-flopped with no error**: background has two onMessage listeners; the main one
   answered bridge types with `Unknown message type` and closed the channel before the bridge
   listener's async sendResponse. Fix: main listener returns false for bridge types.
3. **tools/call would always fail INVALID_TOOL_NAME**: bridge invokeTool passed only
   fullToolName; invokeWebMCPTool routes by (groupKey, fullToolName). Fix: resolve groupKey via
   registry scan first.
4. **Codex saw empty tools with pages open**: bridge listTools read only the event registry;
   tabs opened before extension load never report (registry-silent). Fix: reuse
   discoverWebMCPToolsInCurrentWindow(undefined) (all windows + silent-tab probe).

### 19.3 Distribution (macOS — per-user, deliberately NOT pkg)

- `installer/build-dist-mac.sh` → `EO2Weave-NativeHost-<ver>-macos.zip` = universal binary +
  `install.sh` + README. Recipient: unzip anywhere, `bash install.sh` (no sudo), restart
  browser. Binary → `~/Library/Application Support/EO2Weave NativeHost/…`, quarantine stripped,
  user-level NM manifests for Chrome/Edge, per-user uninstaller installed alongside.
- Pkg route was built and dropped: unsigned pkg triggers "installing to system volume"
  Gatekeeper nag for recipients, and the per-user-via-root-postinstall dance isn't worth it
  vs a two-line shell install. Windows keeps its per-user SFX installer (`build-installer.sh`).
- Known-benign: pkg/zip staging on new macOS carries `com.apple.provenance` xattrs → `._*`
  AppleDouble entries in archives; system-protected, cannot be stripped, harmless.

