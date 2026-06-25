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

import { zip, type AsyncZippable } from 'fflate'

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
export async function exportOPFSBackup(): Promise<{ blob: Blob; filename: string }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('OPFS is not available in this environment')
  }

  const opfsRoot = await navigator.storage.getDirectory()
  const files: Record<string, Uint8Array> = {}
  await collectOPFSFiles(opfsRoot, '', files)

  if (Object.keys(files).length === 0) {
    throw new Error('OPFS is empty')
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
    `[OPFS] Backup created: ${fileCount} files, ${zipped.byteLength} bytes → ${filename}`
  )

  return { blob: new Blob([zipped], { type: 'application/zip' }), filename }
}

/**
 * Snapshot OPFS and trigger a browser download. Returns the filename on
 * success so the caller can show a success toast; throws on failure so
 * the caller can surface the error.
 */
export async function downloadOPFSBackup(): Promise<string> {
  const { blob, filename } = await exportOPFSBackup()
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
  return filename
}
