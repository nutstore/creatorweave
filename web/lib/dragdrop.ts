/**
 * Drag-and-drop file extraction.
 *
 * Browsers cannot hand over the *contents* of a dropped folder through
 * `dataTransfer.files` — a folder arrives either as nothing (Firefox/Safari)
 * or as an unreadable zero-size placeholder File (Chromium). To expand
 * folders into their contained files we grab FileSystemHandles
 * synchronously (the DataTransferItemList is invalidated after the first
 * `await`), then walk the directory tree via the File System Access API.
 */

/** Cap on files extracted from a single folder drop — dragging something
 * like `node_modules` would otherwise freeze the tab and flood the
 * attachment bar. */
export const MAX_DROPPED_FILES = 200

/** Directory names that are skipped when expanding a dropped folder. */
export const SKIPPED_DIR_NAMES = new Set(['node_modules', '.git'])

export interface DroppedFilesResult {
  /** Extracted files. Folder contents are flattened; each file's name keeps
   * its path relative to the dropped folder (e.g. `docs/img/a.png`). */
  files: File[]
  /** True when the drop contained more entries than MAX_DROPPED_FILES. */
  truncated: boolean
}

type DataTransferItemWithHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
}

/**
 * Snapshot the FileSystemHandle promises of a drop event.
 *
 * MUST be called synchronously from the drop handler — once the handler
 * yields (first `await`) the DataTransferItemList is no longer readable.
 */
export function collectFileSystemHandles(
  dataTransfer: DataTransfer,
): Promise<FileSystemHandle | null>[] {
  const promises: Promise<FileSystemHandle | null>[] = []
  const items = dataTransfer.items
  if (!items || items.length === 0) return promises
  const first = items[0] as DataTransferItemWithHandle | undefined
  if (typeof first?.getAsFileSystemHandle !== 'function') return promises
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as DataTransferItemWithHandle | undefined
    const promise = item?.getAsFileSystemHandle?.()
    if (promise) promises.push(promise)
  }
  return promises
}

interface WalkBudget {
  /** How many more files may be collected. */
  remaining: number
  /** Set when entries were skipped because the budget ran out. */
  truncated: boolean
}

/** Wrap a File so its `name` shows the path relative to the dropped folder. */
function withRelativePath(file: File, relativePath: string): File {
  if (file.name === relativePath) return file
  try {
    return new File([file], relativePath, {
      type: file.type,
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}

/**
 * Recursively collect the files under a directory handle. File names are
 * rewritten to the path relative to `dirHandle` (`sub/a.txt`) so attachment
 * chips can show where each file came from. Unreadable entries are skipped.
 */
export async function readDirFilesRecursive(
  dirHandle: FileSystemDirectoryHandle,
  prefix = '',
  results: File[] = [],
  budget: WalkBudget = { remaining: MAX_DROPPED_FILES, truncated: false },
): Promise<File[]> {
  try {
    for await (const [name, handle] of dirHandle.entries()) {
      if (budget.remaining <= 0) {
        budget.truncated = true
        return results
      }
      if (handle.kind === 'directory') {
        if (SKIPPED_DIR_NAMES.has(name)) continue
        await readDirFilesRecursive(
          handle as FileSystemDirectoryHandle,
          `${prefix}${name}/`,
          results,
          budget,
        )
        continue
      }
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        results.push(withRelativePath(file, `${prefix}${name}`))
        budget.remaining -= 1
      } catch {
        // Unreadable entry (permission, vanished file) — skip it.
      }
    }
  } catch {
    // Iteration failed partway (permission revoked, etc.) — keep what we got.
  }
  return results
}

/**
 * Extract the files from a drop event's DataTransfer, expanding any dropped
 * folders into their contained files.
 *
 * Call this synchronously inside the drop handler: the handle promises are
 * captured before the first `await`, then resolved asynchronously.
 */
export async function extractDroppedFiles(
  dataTransfer: DataTransfer,
): Promise<DroppedFilesResult> {
  const plainFiles = Array.from(dataTransfer.files ?? [])
  // Capture handle promises synchronously — we are called directly from the
  // drop handler, before any await has invalidated the item list.
  const handlePromises = collectFileSystemHandles(dataTransfer)

  // Browsers without getAsFileSystemHandle (Firefox/Safari): fall back to
  // plain files — folder drops simply keep the old behaviour.
  if (handlePromises.length === 0) {
    return { files: plainFiles, truncated: false }
  }

  const handles = await Promise.all(
    handlePromises.map((p) => p.catch(() => null)),
  )
  const dirHandles = handles.filter(
    (h): h is FileSystemDirectoryHandle => h?.kind === 'directory',
  )
  const dirNames = new Set(dirHandles.map((d) => d.name))

  const files: File[] = []
  for (const f of plainFiles) {
    // Chromium hands over an unreadable zero-size placeholder File for each
    // dropped folder. It shares the folder's name — skip it when the real
    // folder handle is being expanded instead.
    if (dirNames.has(f.name)) continue
    files.push(f)
  }

  // Rare fallback: a browser exposed file handles but an empty `files` list.
  if (files.length === 0) {
    for (const handle of handles) {
      if (handle?.kind !== 'file') continue
      try {
        files.push(await (handle as FileSystemFileHandle).getFile())
      } catch {
        // skip unreadable entry
      }
    }
  }

  const budget: WalkBudget = {
    remaining: Math.max(0, MAX_DROPPED_FILES - files.length),
    truncated: false,
  }
  for (const dirHandle of dirHandles) {
    if (budget.remaining <= 0) break
    await readDirFilesRecursive(dirHandle, '', files, budget)
  }

  if (budget.truncated) {
    console.warn(
      `[dragdrop] folder drop truncated at ${MAX_DROPPED_FILES} files`,
    )
  }

  return { files, truncated: budget.truncated }
}
