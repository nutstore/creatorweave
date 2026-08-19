/**
 * Full OPFS backup — zips everything under `navigator.storage.getDirectory()`
 * (SQLite database + workspace `files/` + `workspace.json` etc.) into a
 * single downloadable Blob using `fflate`.
 *
 * Use case: user-initiated backup / migration from the ProjectHome sidebar.
 * The SQLite-only export in `sqlite-database.ts` is for the failure path
 * (worker dead but the db file still readable); this is the comprehensive
 * "grab everything" path for normal operation.
 *
 * Caveat: the SQLite worker may be mid-transaction when we snapshot. OPFS
 * reads are atomic per file, so each file is internally consistent, but
 * cross-file consistency is not guaranteed. Acceptable for backup — users
 * running this are usually not in the middle of a write-heavy task.
 */

import { unzip, zip, type AsyncZippable, type Unzipped } from 'fflate'
import { beginReset, endReset } from '@/storage/reset-coordinator'
import { setStorageResetMarker } from '@/storage/reset-marker'

/**
 * Marker file every full backup must contain: the SQLite database at the
 * OPFS root. Keep in sync with SQLITE_DB_FILENAME in sqlite-database.ts
 * (duplicated here to avoid statically coupling this module to the sqlite
 * chunk; the import below is dynamic).
 */
const REQUIRED_DB_FILE = 'bfosa-unified.sqlite'

/**
 * Optional backup entry carrying the raw AES device-encryption key (from
 * IndexedDB, see api-key.repository.ts). Present in every backup created
 * after the key-portability change; older backups simply lack it.
 *
 * SECURITY: whoever holds this file + the backup zip can decrypt all stored
 * API keys / secrets. Backups must be stored accordingly.
 */
const DEVICE_KEY_FILE = 'bfosa-device-key.bin'

/** Every SQLite database starts with this 16-byte magic string. */
const SQLITE_DB_MAGIC = 'SQLite format 3\0'

/**
 * Backup entry carrying all portable localStorage entries as a JSON map
 * `{ key: value }`. Restored wholesale on import (see restoreLocalStorage()).
 *
 * Design: EXPORT-ALL + EXCLUDE-LIST (not a whitelist). New localStorage
 * keys default to traveling with the backup — a "full backup" must not
 * silently drop future data. Only clearly device-local or ephemeral
 * state is excluded (see LOCALSTORAGE_EXCLUDE_PREFIXES).
 */
const LOCALSTORAGE_FILE = 'bfosa-localstorage.json'

/**
 * localStorage keys that must NOT travel with a backup:
 *
 * - `panel-ratio-*` / `splitpane-ratio-*` — pane widths tied to this
 *   device's screen size / window geometry.
 * - `preview-content-*` — throwaway HTML preview cache.
 * - `cw_side_panel_hostname_project_map_v1` — maps THIS browser profile's
 *   side-panel hostnames to project ids; meaningless on another device.
 */
const LOCALSTORAGE_EXCLUDE_PREFIXES = [
  'panel-ratio-',
  'splitpane-ratio-',
  'preview-content-',
  'cw_side_panel_hostname_project_map_v1',
]

/** Collect portable localStorage entries into a JSON string, or null. */
function collectLocalStorage(): string | null {
  try {
    const map: Record<string, string> = {}
    let count = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || LOCALSTORAGE_EXCLUDE_PREFIXES.some((p) => key.startsWith(p))) continue
      const value = localStorage.getItem(key)
      if (value !== null) {
        map[key] = value
        count++
      }
    }
    if (count === 0) return null
    return JSON.stringify(map)
  } catch (error) {
    console.warn('[OPFS] Backup: could not read localStorage:', error)
    return null
  }
}

/** Restore localStorage entries from the backup's JSON map (overwrite). */
function restoreLocalStorage(json: string): number {
  let map: Record<string, string>
  try {
    map = JSON.parse(json) as Record<string, string>
  } catch (error) {
    // A corrupt localStorage payload must never fail the whole restore —
    // OPFS is already written at this point. Log and keep going.
    console.warn('[OPFS] Restore: localStorage payload is not valid JSON, skipping:', error)
    return 0
  }
  let count = 0
  for (const [key, value] of Object.entries(map)) {
    if (typeof value !== 'string') continue
    if (LOCALSTORAGE_EXCLUDE_PREFIXES.some((p) => key.startsWith(p))) continue
    try {
      localStorage.setItem(key, value)
      count++
    } catch (error) {
      console.warn(`[OPFS] Restore: could not write localStorage key "${key}":`, error)
    }
  }
  return count
}

/**
 * Mirrors RESET_REQUIRES_TAB_CLOSURE from `storage/init.ts`. Duplicated as
 * a literal so this module stays decoupled from the heavy storage/init
 * chunk; the UI matches on this marker to show the "close other tabs"
 * guidance. Keep both literals in sync.
 */
const RESET_REQUIRES_TAB_CLOSURE = 'RESET_REQUIRES_TAB_CLOSURE'

/**
 * Recursively walk an OPFS directory and collect every file into a flat
 * map of `path -> bytes`, shaped for fflate's `zip()`.
 */
async function collectOPFSFiles(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: Record<string, Uint8Array>,
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'file') {
      const file = await (handle as FileSystemFileHandle).getFile()
      out[path] = new Uint8Array(await file.arrayBuffer())
    } else {
      await collectOPFSFiles(handle as FileSystemDirectoryHandle, path, out)
    }
  }
}

/**
 * Snapshot the entire OPFS root into a zip Blob.
 *
 * Throws if OPFS is unavailable or contains no files. Caller surfaces the
 * error to the user.
 */
export async function exportOPFSBackup(): Promise<{
  blob: Blob
  filename: string
  includesDeviceKey: boolean
  includesLocalStorage: boolean
}> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('OPFS is not available in this environment')
  }

  const opfsRoot = await navigator.storage.getDirectory()
  const files: Record<string, Uint8Array> = {}
  await collectOPFSFiles(opfsRoot, '', files)

  if (Object.keys(files).length === 0) {
    throw new Error('OPFS is empty')
  }

  // Include the raw device-encryption key (lives in IndexedDB, not OPFS) so
  // the backup can fully restore API keys / secrets on another device.
  // Absent key (never created / read failure) is not fatal — the backup is
  // then credential-less, same as pre-portability backups.
  let includesDeviceKey = false
  try {
    const { exportDeviceEncryptionKey } = await import(
      '@/sqlite/repositories/api-key.repository'
    )
    const rawKey = await exportDeviceEncryptionKey()
    if (rawKey) {
      files[DEVICE_KEY_FILE] = new Uint8Array(rawKey)
      includesDeviceKey = true
    }
  } catch (error) {
    console.warn('[OPFS] Backup: could not include device encryption key:', error)
  }

  // Include portable localStorage state (settings, tokens, input history,
  // …) so a restored device feels like the original. Device-local keys
  // (pane ratios, preview caches) are excluded — see the exclude list.
  const localStorageJson = collectLocalStorage()
  if (localStorageJson !== null) {
    files[LOCALSTORAGE_FILE] = new TextEncoder().encode(localStorageJson)
  }

  // fflate's zip() is async (yields to the event loop between entries) so
  // it won't fully freeze the UI on large backups the way zipSync would.
  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    zip(files as AsyncZippable, { level: 6 }, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })

  const ts = new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19) // YYYY-MM-DD_HH-MM-SS
  const filename = `creatorweave-backup_${ts}.zip`

  const fileCount = Object.keys(files).length
  console.log(
    `[OPFS] Backup created: ${fileCount} files, ${zipped.byteLength} bytes → ${filename}` +
      (includesDeviceKey
        ? ' (includes device encryption key — API keys restorable)'
        : ' (NO device encryption key — API keys will NOT survive restore)')
  )

  return {
    blob: new Blob([zipped], { type: 'application/zip' }),
    filename,
    includesDeviceKey,
    includesLocalStorage: localStorageJson !== null,
  }
}

/**
 * Snapshot OPFS and trigger a browser download. Returns the filename and
 * whether the device encryption key was included, so the caller can show
 * an accurate toast; throws on failure so the caller can surface the error.
 */
export async function downloadOPFSBackup(): Promise<{
  filename: string
  includesDeviceKey: boolean
  includesLocalStorage: boolean
}> {
  const { blob, filename, includesDeviceKey, includesLocalStorage } = await exportOPFSBackup()
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    // Append + click + remove is the most reliable cross-browser pattern
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Defer revoke so the download has time to start in all browsers
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return { filename, includesDeviceKey, includesLocalStorage }
}

//-----------------------------------------------------------------------------
// Import (restore)
//-----------------------------------------------------------------------------

function toImportErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function isImportNotFoundError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'NotFoundError') return true
  const message = toImportErrorMessage(error).toLowerCase()
  return message.includes('not found') || message.includes('could not be found')
}

function isImportLockError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'NoModificationAllowedError') return true
  const message = toImportErrorMessage(error).toLowerCase()
  return message.includes('nomodificationallowederror') || message.includes('modifications are not allowed')
}

/**
 * Delete every entry directly under the OPFS root. Names are collected
 * first because removing entries while iterating `entries()` can skip
 * siblings in some implementations.
 *
 * Entries locked by another tab (typically `bfosa-unified.sqlite` held by
 * another tab's SQLite worker) are collected and reported as a
 * RESET_REQUIRES_TAB_CLOSURE error — the same contract as
 * `clearSQLiteAndProjectsDirectory`, so the UI can tell the user to close
 * other tabs instead of showing a cryptic failure.
 */
async function clearOPFSRoot(root: FileSystemDirectoryHandle): Promise<void> {
  const names: string[] = []
  for await (const [name] of root.entries()) {
    names.push(name)
  }
  const locked: string[] = []
  for (const name of names) {
    try {
      // `recursive: true` is only meaningful for directories but is
      // harmless (and simpler) when passed for file entries.
      await root.removeEntry(name, { recursive: true })
    } catch (error) {
      if (isImportNotFoundError(error)) continue
      if (isImportLockError(error)) {
        locked.push(name)
        continue
      }
      throw new Error(`Failed to clear OPFS entry "${name}": ${toImportErrorMessage(error)}`)
    }
  }
  if (locked.length > 0) {
    throw new Error(
      `${RESET_REQUIRES_TAB_CLOSURE} OPFS entries locked by another tab/window: ${locked.join(', ')}`
    )
  }
}

/**
 * Validate unzipped entries and normalize them into `path -> bytes`.
 *
 * - Skips directory markers (`foo/`) and macOS archive noise
 *   (`__MACOSX/`, `.DS_Store`).
 * - Skips the legacy `.bfosa-pool` SAH pool: restoring it could shadow the
 *   freshly restored database with a stale copy (the same reason
 *   `clearLegacySahPoolFromOPFSRoot` scrubs it on reset).
 * - Zip-slip guard: rejects absolute paths and `..` segments.
 * - Requires the SQLite database file and verifies its magic header — a
 *   mislabeled archive fails here, BEFORE any destructive step runs.
 */
function validateBackupEntries(entries: Unzipped): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>()
  for (const [rawPath, data] of Object.entries(entries)) {
    if (rawPath.endsWith('/') || rawPath.startsWith('__MACOSX/')) continue
    if (rawPath.split('/').pop() === '.DS_Store') continue
    if (rawPath === '.bfosa-pool' || rawPath.startsWith('.bfosa-pool/')) continue

    const path = rawPath.replace(/^\.\//, '')
    if (!path || path.startsWith('/') || path.split('/').includes('..')) {
      throw new Error(`Invalid entry in backup archive: "${rawPath}"`)
    }
    files.set(path, data)
  }
  const dbBytes = files.get(REQUIRED_DB_FILE)
  if (!dbBytes) {
    throw new Error(
      `Backup archive does not contain the SQLite database (${REQUIRED_DB_FILE})`
    )
  }
  const header = new TextDecoder().decode(dbBytes.subarray(0, SQLITE_DB_MAGIC.length))
  if (header !== SQLITE_DB_MAGIC) {
    throw new Error(
      `"${REQUIRED_DB_FILE}" in the archive is not a valid SQLite database`
    )
  }
  return files
}

/** Write `path -> bytes` back under the OPFS root, creating directories. */
async function writeBackupToOPFS(
  root: FileSystemDirectoryHandle,
  files: Map<string, Uint8Array>
): Promise<void> {
  for (const [path, data] of files) {
    const segments = path.split('/')
    const filename = segments.pop()!
    let dir = root
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, { create: true })
    }
    const fileHandle = await dir.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(data)
    await writable.close()
  }
}

/**
 * Replace the entire OPFS content with a backup zip produced by
 * `exportOPFSBackup` (full restore, not a merge).
 *
 * Sequence:
 * 1. Unzip the archive fully into memory and validate it — if the archive
 *    is invalid we bail out with the current data untouched.
 * 2. Enter reset mode (broadcast to other tabs + storage reset marker, so
 *    the post-reload `initStorage()` treats the next init as "after reset"
 *    and clears the marker once the restored db opens healthily — the same
 *    contract as `clearSQLiteAndProjectsDirectory`).
 * 3. Close the SQLite worker so it releases its OPFS file locks, and drop
 *    cached workspace runtimes so no stale directory handles survive.
 * 4. Clear the OPFS root, then write every entry back.
 *
 * The caller MUST reload the page afterwards so stores / workers
 * re-initialize from the restored files. If a write fails mid-restore
 * (e.g. quota exceeded) OPFS may be left in a partial state — the caller
 * should surface the error and advise re-running the import.
 */
export async function importOPFSBackup(file: File): Promise<{ fileCount: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('OPFS is not available in this environment')
  }
  if (file.size === 0) {
    throw new Error('Backup file is empty')
  }

  // fflate's async unzip runs off the main thread (worker pool), matching
  // the export path's behaviour on large archives.
  const zipped = new Uint8Array(await file.arrayBuffer())
  const entries: Unzipped = await new Promise((resolve, reject) => {
    unzip(zipped, (err, data) => (err ? reject(err) : resolve(data)))
  })
  const files = validateBackupEntries(entries)

  const { token } = beginReset()
  setStorageResetMarker(token)

  try {
    // Release the SQLite worker's OPFS locks before replacing files. Dynamic
    // import keeps this module loadable without pulling the sqlite chunk.
    // Best-effort: close() force-terminates an unresponsive worker anyway.
    const { getSQLiteDB } = await import('@/sqlite')
    try {
      await getSQLiteDB().close()
    } catch (error) {
      console.warn('[OPFS] Closing SQLite worker before import failed (continuing):', error)
    }

    const { resetWorkspaceManager } = await import('@/opfs')
    resetWorkspaceManager()

    const opfsRoot = await navigator.storage.getDirectory()
    await clearOPFSRoot(opfsRoot)

    // Pull the device-encryption key out of the write set BEFORE writing to
    // OPFS — it belongs in IndexedDB, not OPFS, and must pair with the
    // api_keys ciphertexts restored from this same backup. Without it,
    // getEncryptionKey() detects the metadata/ciphertext mismatch after
    // reload and wipes the restored api_keys table.
    const deviceKeyBytes = files.get(DEVICE_KEY_FILE)
    if (deviceKeyBytes) {
      files.delete(DEVICE_KEY_FILE)
    }
    // Same for the localStorage map — it goes to localStorage, not OPFS.
    const localStorageJson = files.get(LOCALSTORAGE_FILE)
    if (localStorageJson) {
      files.delete(LOCALSTORAGE_FILE)
    }
    await writeBackupToOPFS(opfsRoot, files)

    if (deviceKeyBytes) {
      const { importDeviceEncryptionKey } = await import(
        '@/sqlite/repositories/api-key.repository'
      )
      await importDeviceEncryptionKey(
        deviceKeyBytes.buffer.slice(
          deviceKeyBytes.byteOffset,
          deviceKeyBytes.byteOffset + deviceKeyBytes.byteLength
        ) as ArrayBuffer
      )
    }

    // Restore localStorage entries AFTER the OPFS write so a localStorage
    // failure cannot leave a half-written OPFS behind. The page reloads
    // immediately after import returns, so stores pick up the new values
    // on rehydration without any extra invalidation.
    let restoredLocalEntries = 0
    if (localStorageJson) {
      restoredLocalEntries = restoreLocalStorage(
        new TextDecoder().decode(localStorageJson)
      )
    }

    resetWorkspaceManager()

    console.log(
      `[OPFS] Backup restored: ${files.size} files + ${restoredLocalEntries} localStorage entries from "${file.name}"`
    )
    return { fileCount: files.size }
  } finally {
    // The reset marker intentionally survives until the post-reload
    // initStorage() clears it after a healthy initialization.
    endReset(token)
  }
}
