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
