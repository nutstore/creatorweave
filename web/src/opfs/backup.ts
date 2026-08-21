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

import {
  Zip,
  ZipDeflate,
  unzip,
  type Unzipped,
} from 'fflate'
import { beginReset, endReset } from '@/storage/reset-coordinator'
import { setStorageResetMarker } from '@/storage/reset-marker'
import { formatBytes } from '@/lib/utils'

/**
 * OPFS directory used to spill the in-progress backup zip to disk. The
 * download then uses the disk-backed File — memory stays O(chunk) instead
 * of O(total backup size). Cleaned up after download; also skipped by the
 * walker (an export must not zip its own output) and tolerated by the
 * restore validator (stale leftovers from a crashed export must not brick
 * imports).
 */
const BACKUP_TMP_DIR = '.eo2weave-backup-tmp'

/**
 * Final-chunk terminator for `ZipDeflate.push()`. fflate expects a
 * zero-length Uint8Array with `final=true` to flush the compressor.
 */
const EMPTY_CHUNK = new Uint8Array(0)

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
 * Recursively walk an OPFS directory tree and stream every file into an
 * in-flight `Zip`. Uses `File.stream()` (a ReadableStream<Uint8Array>) so
 * fflate reads each entry in fixed-size chunks rather than materialising
 * the whole thing as a single ArrayBuffer.
 *
 * This is the change that lets the backup handle large files / large OPFS
 * volumes: the previous `await file.arrayBuffer()` path tripped
 * `Array buffer allocation failed` whenever a single file exceeded the
 * browser's ArrayBuffer ceiling (typically ~2 GiB in Chrome, but earlier
 * failures from GC / page-budget pressure are common).
 *
 * Per-file failures are wrapped with the entry path (and size, if known)
 * so the user sees e.g. "Backup failed while reading
 * projects/abc/big.mp4 (1.4 GiB)…" instead of a generic "allocation
 * failed" surfacing out of the fflate worker.
 */
const PASS_THROUGH_THRESHOLD = 64 * 1024 * 1024 // 64 MiB

/**
 * Upper bound for a single `deflate.push()` call. fflate's synchronous
 * `Deflate` grows its internal window buffer to fit the pushed chunk
 * (`new u8(endLen & -32768)` in Deflate.push) and `dflt()` pre-allocates
 * the output buffer for the whole pending window — so one oversized
 * browser stream chunk (File.stream() can hand out multi-MB chunks for
 * large files) becomes one oversized allocation. Re-slicing into ≤1 MiB
 * pieces pins the per-call allocation ceiling regardless of what chunk
 * size the browser hands us.
 */
const PUSH_SLICE = 1024 * 1024 // 1 MiB

/**
 * File extensions whose contents are already DEFLATE-compressed (or
 * compressed by a stronger codec). Deflating them again burns CPU for
 * near-zero size savings and — worse — guarantees a ~1:1 output buffer
 * for the input window, the worst case for allocation pressure. These
 * entries are stored (level 0) instead.
 */
const ALREADY_COMPRESSED_EXTENSIONS = new Set([
  'zip', 'gz', 'bz2', 'xz', 'zst', '7z', 'rar',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic',
  'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus', 'wav',
  'mp4', 'mkv', 'mov', 'avi', 'webm',
  'pdf', 'docx', 'xlsx', 'pptx', 'epub', 'jar', 'woff2',
])

/** Decide the compression level for a zip entry from name + size. */
function levelFor(path: string, size: number): 0 | 6 {
  if (size > PASS_THROUGH_THRESHOLD) return 0
  const dot = path.lastIndexOf('.')
  if (dot > 0 && ALREADY_COMPRESSED_EXTENSIONS.has(path.slice(dot + 1).toLowerCase())) {
    return 0
  }
  return 6
}

/**
 * Push a `File`'s contents into a `ZipDeflate` chunk-by-chunk via
 * `File.stream()`. Each chunk is fed into the synchronous deflate
 * pipeline as it arrives from the OPFS reader — the resident buffer
 * is bounded by a single chunk (~64 KiB – 1 MiB from the browser's
 * default ReadableStream chunk size) rather than the whole file,
 * which is what lets the export path survive multi-GB attachments
 * without tripping `Array buffer allocation failed`.
 *
 * `ZipDeflate.push()` is synchronous: each chunk is compressed
 * immediately on the main thread. This trades main-thread CPU time
 * for not having to round-trip through a Web Worker (which matters
 * in test environments where happy-dom ships a no-op Worker polyfill,
 * but is also acceptable in production because the user's only goal
 * here is to download a backup — the UI freeze is the lesser evil
 * compared to the OOM crash that the previous code triggered on
 * large OPFS roots).
 *
 * Caller is responsible for `deflate.push(EMPTY_CHUNK, true)` after
 * this resolves so the deflate stream is finalised.
 */
async function streamFileIntoDeflate(
  deflate: ZipDeflate,
  file: File,
): Promise<void> {
  const reader = file.stream().getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      // Re-slice oversized browser chunks: one push() = one output-buffer
      // allocation inside fflate, so cap the per-call size at PUSH_SLICE.
      for (let off = 0; off < value.length; off += PUSH_SLICE) {
        deflate.push(
          off === 0 && value.length <= PUSH_SLICE
            ? value
            : value.subarray(off, Math.min(off + PUSH_SLICE, value.length)),
          false
        )
      }
    }
  } finally {
    reader.releaseLock()
  }
}

async function streamOPFSToZip(
  zip: Zip,
  dir: FileSystemDirectoryHandle,
  prefix: string,
  stats: { fileCount: number; totalBytes: number },
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    // Skip the backup temp directory (spill target for large exports) —
    // otherwise an export would zip its own in-progress output.
    if (!prefix && name === BACKUP_TMP_DIR) continue
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'file') {
      let file: File
      try {
        file = await (handle as FileSystemFileHandle).getFile()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Backup failed while opening "${path}": ${message}`)
      }
      // Level 0 (store) for already-compressed payloads and very large
      // files — see levelFor(). Deflate output for such inputs is ~1:1,
      // so compressing just burns CPU and maximises allocation pressure.
      const opts = { level: levelFor(path, file.size) } as const
      try {
        const deflate = new ZipDeflate(path, opts)
        zip.add(deflate)
        await streamFileIntoDeflate(deflate, file)
        deflate.push(EMPTY_CHUNK, true) // signal end-of-stream
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `Backup failed while streaming "${path}" (${formatBytes(file.size)}): ${message}`
        )
      }
      stats.fileCount++
      stats.totalBytes += file.size
    } else {
      await streamOPFSToZip(
        zip,
        handle as FileSystemDirectoryHandle,
        path,
        stats
      )
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

  // Sink strategy: spill the zip to an OPFS temp file so memory stays
  // O(chunk) regardless of total backup size, then hand the caller a
  // disk-backed File. If OPFS writes fail (quota / transient), fall back
  // to accumulating chunks in memory — same behaviour as before the spill
  // existed, and small backups fit there easily.
  //
  // Why not always memory: accumulating every output chunk kept the whole
  // zip (often GBs with workspace attachments) resident until
  // `new Blob(chunks)` — the "Array buffer allocation failed" crash.
  // A Blob references its parts, so even the final assembly used to
  // double-count that memory.
  interface Sink {
    write(chunk: Uint8Array): Promise<void> | void
    finish(): Promise<{ blob: Blob; byteLength: number; spillFile?: File; spillDir?: FileSystemDirectoryHandle }>
  }

  const memoryChunks: Uint8Array[] = []
  let spillWritable: FileSystemWritableFileStream | null = null
  let spillFileHandle: FileSystemFileHandle | null = null
  let spillDirHandle: FileSystemDirectoryHandle | null = null
  let spilled = false

  const openSpill: () => Promise<boolean> = async () => {
    if (spilled || spillWritable) return true
    try {
      spillDirHandle = await opfsRoot.getDirectoryHandle(BACKUP_TMP_DIR, { create: true })
      spillFileHandle = await spillDirHandle.getFileHandle('backup.zip', { create: true })
      spillWritable = await spillFileHandle.createWritable()
      return true
    } catch (error) {
      console.warn('[OPFS] Backup: spill-to-disk unavailable, falling back to memory:', error)
      spillWritable = null
      spillFileHandle = null
      spillDirHandle = null
      spilled = true // stop retrying; keep using memory
      return false
    }
  }

  const sink: Sink = {
    async write(chunk: Uint8Array) {
      if (spillWritable || (await openSpill())) {
        try {
          await spillWritable!.write(chunk)
          return
        } catch (error) {
          console.warn('[OPFS] Backup: spill write failed, finishing in memory:', error)
          spillWritable = null
          spilled = true
        }
      }
      memoryChunks.push(chunk)
    },
    async finish() {
      if (spillWritable) {
        await spillWritable.close()
        spillWritable = null
        const file = await spillFileHandle!.getFile()
        return { blob: file, byteLength: file.size, spillFile: file, spillDir: spillDirHandle! }
      }
      return {
        blob: new Blob(memoryChunks, { type: 'application/zip' }),
        byteLength: memoryChunks.reduce((sum, c) => sum + c.byteLength, 0),
      }
    },
  }

  let resolveFinal!: () => void
  let rejectFinal!: (err: Error) => void
  const finalPromise = new Promise<void>((resolve, reject) => {
    resolveFinal = resolve
    rejectFinal = reject
  })
  // Error paths reject this promise via rejectFinal() AFTER the outward
  // throw — nothing awaits it there, so attach a no-op catch to keep Node
  // from reporting an unhandled rejection. (Awaiting it on the happy path
  // still sees the rejection.)
  finalPromise.catch(() => {})

  // The Zip callback fires synchronously during push()/end(), but sink
  // writes are async (OPFS). Chain them so writes land in order and so the
  // producer can wait for the queue to drain before finish().
  let writeChain: Promise<void> = Promise.resolve()
  const enqueueWrite = (chunk: Uint8Array) => {
    writeChain = writeChain.then(() => sink.write(chunk)).catch((error) => {
      console.error('[OPFS] Backup: sink write failed:', error)
      throw error
    })
  }
  const sinkDrained = () => writeChain

  const zip = new Zip((err, data, final) => {
    if (err) {
      rejectFinal(err)
      return
    }
    if (data) enqueueWrite(data)
    if (final) resolveFinal()
  })

  // Stream the OPFS tree into the in-flight Zip. Per-file failures throw
  // a path-tagged error caught by the surrounding try/catch; we still
  // await finalPromise so the Zip worker's internal state is settled
  // before we surface the error.
  const stats = { fileCount: 0, totalBytes: 0 }
  let includesDeviceKey = false
  let localStorageJson: string | null = null

  try {
    await streamOPFSToZip(zip, opfsRoot, '', stats)

    if (stats.fileCount === 0) {
      throw new Error('OPFS is empty')
    }

    // Include the raw device-encryption key (lives in IndexedDB, not OPFS)
    // so the backup can fully restore API keys / secrets on another
    // device. Absent key (never created / read failure) is not fatal —
    // the backup is then credential-less, same as pre-portability backups.
    try {
      const { exportDeviceEncryptionKey } = await import(
        '@/sqlite/repositories/api-key.repository'
      )
      const rawKey = await exportDeviceEncryptionKey()
      if (rawKey) {
        // Small (32 bytes), push as a single chunk. Pass-through
        // (level 0) since AES key bytes don't compress.
        const deflate = new ZipDeflate(DEVICE_KEY_FILE, { level: 0 })
        zip.add(deflate)
        deflate.push(new Uint8Array(rawKey), false)
        deflate.push(EMPTY_CHUNK, true)
        includesDeviceKey = true
      }
    } catch (error) {
      console.warn('[OPFS] Backup: could not include device encryption key:', error)
    }

    // Include portable localStorage state (settings, tokens, input history,
    // …) so a restored device feels like the original. Device-local keys
    // (pane ratios, preview caches) are excluded — see the exclude list.
    localStorageJson = collectLocalStorage()
    if (localStorageJson !== null) {
      const deflate = new ZipDeflate(LOCALSTORAGE_FILE, { level: 6 })
      zip.add(deflate)
      deflate.push(new TextEncoder().encode(localStorageJson), false)
      deflate.push(EMPTY_CHUNK, true)
    }

    // fflate's Zip requires an explicit end() once all entries are queued
    // — it emits the central directory (the `final=true` callback) that
    // resolves finalPromise. Without it the promise hangs forever.
    zip.end()
    await finalPromise
    // The Zip emits its final chunks synchronously from end(), but the sink
    // writes them asynchronously — drain pending writes before finish().
    // A cheap microtask-yield loop suffices: writes are issued in order and
    // each sink.write() call site awaits the previous one via the chain.
    await sinkDrained()
  } catch (error) {
    // Make sure the Zip worker doesn't hang waiting for finalize when
    // we re-throw.
    rejectFinal(error instanceof Error ? error : new Error(String(error)))
    // Best-effort cleanup of the spill file — a crashed export must not
    // leave a multi-GB temp file hogging the user's OPFS quota.
    try {
      // Cast: TS cannot see the closure assignments to spillWritable, so its
      // narrowed type here is `null`; the runtime value may be a live stream.
      const writable = spillWritable as FileSystemWritableFileStream | null
      if (writable) await writable.close().catch(() => {})
      if (spillDirHandle) await opfsRoot.removeEntry(BACKUP_TMP_DIR, { recursive: true })
    } catch { /* best-effort */ }
    throw error instanceof Error ? error : new Error(String(error))
  }

  const ts = new Date().toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19) // YYYY-MM-DD_HH-MM-SS
  const filename = `eo2weave-backup_${ts}.zip`

  const { blob, byteLength, spillDir } = await sink.finish()
  console.log(
    `[OPFS] Backup created: ${stats.fileCount} files (${formatBytes(stats.totalBytes)} raw) → ${formatBytes(byteLength)} zip${spillDir ? ' (disk-spilled)' : ''} → ${filename}` +
      (includesDeviceKey
        ? ' (includes device encryption key — API keys restorable)'
        : ' (NO device encryption key — API keys will NOT survive restore)')
  )

  return {
    blob,
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
  // Release the SQLite worker's OPFS sync-access handles before reading OPFS
  // from the main thread. While the worker holds a sync access handle on
  // bfosa-unified.sqlite, main-thread getFile()/stream() on that same file is
  // rejected with NotReadableError ("permission problems ... after a
  // reference to a file was acquired") — the bare DOMException that used to
  // surface in the failure toast. Closing also flushes pending WAL frames so
  // the backup contains a fully committed database. The manager re-opens the
  // worker lazily on the next SQL call, so the app keeps working without a
  // reload (importOPFSBackup relies on the same close() contract).
  let dbClosed = false
  try {
    const { getSQLiteDB } = await import('@/sqlite')
    await getSQLiteDB().close()
    dbClosed = true
  } catch (error) {
    // Worker already dead / never initialized — the export can still run,
    // it just races the (nonexistent) holder of any lock.
    console.warn('[OPFS] Backup: closing SQLite worker failed (continuing):', error)
  }

  try {
    const { blob, filename, includesDeviceKey, includesLocalStorage } =
      await exportOPFSBackup()
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
  } finally {
    // Best-effort: remove the spill directory (whether the export succeeded
    // or failed) — the backup bytes are already on their way to the user's
    // Downloads folder, the temp copy is pure quota waste. Stale leftovers
    // from a crashed run are also tolerated by the walker/validator.
    try {
      const opfsRoot = await navigator.storage.getDirectory()
      await opfsRoot.removeEntry(BACKUP_TMP_DIR, { recursive: true })
    } catch {
      // absent or locked — harmless either way
    }
    // Re-open the worker so subsequent SQL operations work without a page
    // reload. initialize() is idempotent and no-ops when someone else has
    // already re-initialized. Best-effort: an app that never touches SQLite
    // again doesn't care, and the next explicit use retries init anyway
    // (SQLiteDBManager.initialize has its own retry/backoff).
    if (dbClosed) {
      try {
        const { getSQLiteDB } = await import('@/sqlite')
        await getSQLiteDB().initialize()
      } catch (error) {
        console.warn('[OPFS] Backup: re-initializing SQLite worker failed:', error)
      }
    }
  }
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
    // Spill dir from old backups made while the disk-spill path was active;
    // stale leftovers must not block imports (validated above) and must not
    // be restored as data.
    if (rawPath === BACKUP_TMP_DIR || rawPath.startsWith(BACKUP_TMP_DIR + '/')) continue

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
/**
 * Read a user-picked backup File into a Uint8Array with retry. Chrome can
 * transiently fail `arrayBuffer()` on a disk-backed File with
 * NotReadableError ("permission problems ... after a reference to a file
 * was acquired") — typically AV scanning, file lock, or a downloader still
 * flushing. The file reference itself stays valid, so retrying after a
 * short backoff is the standard remedy.
 */
async function readFileWithRetry(file: File, label: string): Promise<Uint8Array> {
  const maxAttempts = 4
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return new Uint8Array(await file.arrayBuffer())
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      const retryable =
        message.includes('could not be read') ||
        message.toLowerCase().includes('notreadable')
      if (!retryable || attempt === maxAttempts) break
      console.warn(
        `[OPFS] Restore: reading ${label} failed (attempt ${attempt}/${maxAttempts}), retrying...`
      )
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt))
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`Could not read "${label}" (${formatBytes(file.size)}): ${message}`)
}

export async function importOPFSBackup(file: File): Promise<{ fileCount: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('OPFS is not available in this environment')
  }
  if (file.size === 0) {
    throw new Error('Backup file is empty')
  }

  // Read the picked file BEFORE any destructive step. Use the retry helper:
  // between the user picking the file and clicking "confirm", arbitrary
  // time passes — the disk-backed File can transiently throw
  // NotReadableError on first read (AV scan / lock / download flush), which
  // a bounded retry reliably rides out.
  const zipped = await readFileWithRetry(file, file.name)
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
