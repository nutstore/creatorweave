# CreatorWeave Native Host

Browser extension disk executor via Chrome Native Messaging. See [`/STATUS.md`](../../STATUS.md) for the full design.

## Build

```bash
cd browser-extension/native-host
cargo build --release
```

The binary is at `target/release/cw-native-host`.

## Install (macOS)

Run the install script to register the native messaging host manifest:

```bash
cargo build --release
./install.sh
```

This creates the Chrome NM manifest at:
`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.creatorweave.nativehost.json`

## Install (Windows)

### Option 1: Installer (recommended for end users)

Build a single-file setup exe (works on any host OS — needs `cargo`, `7z`, `curl`):

```bash
./installer/build-installer.sh
```

Output: `installer/EO2Weave-Host-Setup-<ver>.exe` (~460 KB). Double-click on
Windows → consent prompt → copies the host to
`%LOCALAPPDATA%\EO2Weave\NativeMessagingHosts\`, registers the Chrome NM
manifest (HKCU, no admin), registers Edge too, and adds an Add/Remove-Programs
uninstall entry. Fully restart Chrome afterwards.

### Option 2: Manual (PowerShell)

Build the Windows binary (natively on Windows with the MSVC toolchain, or
cross-compile from another OS), then run the PowerShell installer:

```powershell
cargo build --release
copy target\release\cw-native-host.exe .   # or build straight into a known path
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

`install.ps1` writes the manifest to
`%LOCALAPPDATA%\CreatorWeave\NativeMessagingHosts\com.creatorweave.nativehost.json`
and registers it under `HKCU\Software\Google\Chrome\NativeMessagingHosts\`
(HKCU only — no admin rights needed; an Edge key is registered too).
Uninstall with `uninstall.ps1`. See STATUS.md §8 for the Windows design.

## Actions

| Action | Description |
|---|---|
| `ping` | Link self-test |
| `list_scopes` | List authorized directories |
| `pick_folder` | Show folder picker, create new scope |
| `remove_scope` | Revoke an authorized directory |
| `stat_file` | File metadata (size, mtime) |
| `list_dir` | Non-recursive directory listing |
| `read_file` | Read small file (single message) |
| `read_file_at` | Chunked read (offset + length) |
| `write_file` | Write small file (single message) |
| `write_file_at` | Chunked write (truncate + finalize) |
| `delete_file` | Delete file or directory |
