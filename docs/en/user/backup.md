---
title: Backup and Migration
order: 8
---

# Backup and Migration

All EO2Weave data (projects, conversations, files, API keys, app settings) lives in the browser's local OPFS storage — **nothing is synced to the cloud automatically**. Data is bound to the "origin + browser" pair: when switching computers, browsers, or migrating from an old address to a new domain (e.g. weave.eo2suite.cn), use export / import to move your data.

## What's Inside a Backup

| Content | Description |
|---------|-------------|
| SQLite database | Projects, conversations, workspace metadata, encrypted API keys |
| Workspace files | All files inside each project workspace |
| Device encryption key | Allows API keys to be decrypted and used after import |
| App settings | Theme, language, model configuration, input history, etc. |

## Exporting a Backup

1. Open the app **home page** (project list)
2. Find the **"Advanced"** collapsible panel in the left sidebar (collapsed by default, labeled "Reset, backup, cache clearing, etc.") and click to expand it
3. In the **"Data Backup"** card, click **"Export"**
4. A confirmation dialog warns that the backup contains the encryption key and login credentials — click **"Export Backup"** to confirm
5. Wait a moment (the button shows "Backing up…"); the browser downloads a file like `eo2weave-backup_2026-08-20_14-30-00.zip`
6. **Store the file safely**: it is equivalent to full account access (including API keys) — never share it or put it in public storage

> 💡 When the import dialog suggests "exporting a fresh backup first", this is the feature it means. Making regular exports is a good habit.

## Importing a Backup (Restore / Migrate to a New Device)

1. Open EO2Weave on the new device / browser and go to the **home page**
2. Expand **"Advanced"** in the left sidebar → **"Data Backup"** card → click **"Import"**
3. Select the previously exported `.zip` backup file in the file picker
4. The confirmation dialog warns: **importing wipes ALL current data (projects, conversations, files) and replaces it with the backup**
5. Click **"Overwrite & Restore"**, wait for "Restoring…" to finish — the page reloads automatically
6. After the reload, all projects, conversations, files, API keys, and settings are restored to the state at export time

## Notes

- **Import is a full replacement, not a merge**: everything on the current device is overwritten by the backup. If the target device also holds important data, export it first.
- **Only zips exported by this app are accepted**: the import validates that the archive contains the SQLite database file; picking a random zip fails immediately without touching existing data.
- **Close other tabs**: if other EO2Weave tabs are open in the same browser, the database file stays locked and the import fails — close them as prompted and retry.
- **Cross-domain migration**: migrating from an old address to weave.eo2suite.cn (or any future domain change) uses the same export / import flow, because OPFS storage is isolated per origin.
- **Keep backups private**: a backup contains the encryption key, API keys, and login credentials — anyone holding the file gains full access to your account.
