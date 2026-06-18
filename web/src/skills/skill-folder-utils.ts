/**
 * Shared utilities for skill folder import operations.
 *
 * Used by both ProjectSkillDropZone (→ native FS `.skills/`) and
 * UserSkillDropZone (→ OPFS `.skills/user/`) to avoid code duplication.
 */

/** A lightweight file tree entry for preview */
export interface FileEntry {
  name: string
  kind: 'file' | 'directory'
  children?: FileEntry[]
}

/**
 * Recursively copy all entries from one directory handle to another.
 *
 * @returns the number of files copied.
 */
export async function copyDirectoryRecursive(
  src: FileSystemDirectoryHandle,
  dest: FileSystemDirectoryHandle,
): Promise<number> {
  let fileCount = 0
  for await (const entry of src.values()) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile()
      const destFile = await dest.getFileHandle(entry.name, { create: true })
      const writable = await destFile.createWritable()
      await writable.write(file)
      await writable.close()
      fileCount++
    } else if (entry.kind === 'directory') {
      const subDir = await dest.getDirectoryHandle(entry.name, { create: true })
      fileCount += await copyDirectoryRecursive(
        entry as FileSystemDirectoryHandle,
        subDir,
      )
    }
  }
  return fileCount
}

/** Check if a directory contains SKILL.md (case-insensitive). */
export async function containsSkillMd(
  dir: FileSystemDirectoryHandle,
): Promise<boolean> {
  for await (const entry of dir.values()) {
    if (entry.kind === 'file' && entry.name.toLowerCase() === 'skill.md') {
      return true
    }
  }
  return false
}

/**
 * Read a directory tree for preview (limited depth to avoid performance issues).
 *
 * @returns the tree entries and total file count.
 */
export async function readFileTree(
  dir: FileSystemDirectoryHandle,
  maxDepth = 2,
): Promise<{ entries: FileEntry[]; count: number }> {
  let count = 0
  const entries: FileEntry[] = []
  for await (const entry of dir.values()) {
    if (entry.kind === 'file') {
      entries.push({ name: entry.name, kind: 'file' })
      count++
    } else if (entry.kind === 'directory' && maxDepth > 0) {
      const sub = await readFileTree(
        entry as FileSystemDirectoryHandle,
        maxDepth - 1,
      )
      entries.push({ name: entry.name, kind: 'directory', children: sub.entries })
      count += sub.count
    } else if (entry.kind === 'directory') {
      // At max depth, just note the directory without expanding
      entries.push({ name: entry.name, kind: 'directory' })
    }
  }
  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return { entries, count }
}

/** Validate that a folder name is a safe skill directory identifier. */
export function isValidSkillDirName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)
}
