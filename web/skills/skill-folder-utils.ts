/**
 * Shared utilities for skill folder import operations.
 *
 * Used by both ProjectSkillDropZone (→ native FS `.skills/`) and
 * UserSkillDropZone (→ OPFS `.skills/user/`) to avoid code duplication.
 */

import { unzipSync } from 'fflate'

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

// ============================================================================
// ZIP helpers — shared between ProjectSkillDropZone and UserSkillDropZone
// (UserSkillDropZone also has its own zip import in user-skills-scanner.ts,
//  but project skills write to native FS so they need these helpers.)
// ============================================================================

/** Preview of a single skill inside a zip (for confirmation UI). */
export interface ZipSkillPreviewEntry {
  /** Skill directory name (inferred from zip filename or root folder) */
  dirName: string
  /** File tree for preview */
  entries: FileEntry[]
  /** File count for this skill */
  fileCount: number
  /** The common root prefix in the zip (e.g. "my-skill/") */
  commonRoot: string
}

/** Result of inspecting a zip before import — used for preview UI. */
export interface ZipSkillPreview {
  /** Whether this zip contains multiple skills (bundle mode) */
  isBundle: boolean
  /** Single skill preview (when isBundle=false) */
  skill?: ZipSkillPreviewEntry
  /** Multiple skill previews (when isBundle=true) */
  skills?: ZipSkillPreviewEntry[]
  /** The raw unzipped entries (path → data), kept for the actual write */
  raw: Record<string, Uint8Array>
}

/** Find all SKILL.md paths in the unzipped data (case-insensitive). */
function findAllSkillMdPaths(paths: string[]): string[] {
  return paths.filter((p) => p.split('/').pop()?.toLowerCase() === 'skill.md')
}

/**
 * Build a FileEntry tree from a flat list of slash-separated paths.
 * Used for zip preview (zip entries are flat, not hierarchical).
 */
function buildFileTreeFromPaths(paths: string[]): FileEntry[] {
  const root: FileEntry[] = []

  for (const path of paths) {
    const parts = path.split('/').filter(Boolean)
    let level = root

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isFile = i === parts.length - 1

      if (isFile) {
        level.push({ name, kind: 'file' })
      } else {
        let dir = level.find((e) => e.kind === 'directory' && e.name === name)
        if (!dir) {
          dir = { name, kind: 'directory', children: [] }
          level.push(dir)
        }
        level = dir.children!
      }
    }
  }

  // Sort: directories first, then files, alphabetically
  const sortEntries = (entries: FileEntry[]) => {
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    entries.forEach((e) => {
      if (e.children) sortEntries(e.children)
    })
  }
  sortEntries(root)

  return root
}

/**
 * Build a single ZipSkillPreviewEntry from a SKILL.md path within the zip.
 * Derives dirName and collects all files under the same root.
 */
function buildSkillEntry(
  allPaths: string[],
  skillMdPath: string,
  fallbackDirName: string,
): ZipSkillPreviewEntry {
  const segments = skillMdPath.split('/')
  const commonRoot = segments.length > 1 ? segments.slice(0, -1).join('/') + '/' : ''

  let dirName: string
  if (commonRoot) {
    dirName = commonRoot.replace(/\/$/, '')
    if (dirName.includes('/')) {
      dirName = dirName.split('/').pop()!
    }
  } else {
    dirName = fallbackDirName
  }

  const skillPaths = commonRoot
    ? allPaths.filter((p) => p.startsWith(commonRoot))
    : allPaths

  const relativePaths = skillPaths.map((p) =>
    commonRoot && p.startsWith(commonRoot) ? p.slice(commonRoot.length) : p,
  )

  return {
    dirName,
    entries: buildFileTreeFromPaths(relativePaths),
    fileCount: skillPaths.length,
    commonRoot,
  }
}

/**
 * Inspect a zip file for skill import (stage 1 — validation + preview).
 *
 * Unzips in memory, finds SKILL.md file(s), and builds preview data.
 * Supports both single-skill zips and multi-skill bundle zips.
 *
 * @param zipFile  The .zip File object (from drag-drop or file picker)
 * @returns preview data, or throws if the zip is invalid.
 */
export async function previewSkillZip(zipFile: File): Promise<ZipSkillPreview> {
  const buffer = await zipFile.arrayBuffer()
  const unzipped = unzipSync(new Uint8Array(buffer))

  const allPaths = Object.keys(unzipped).filter((p) => !p.endsWith('/'))
  if (allPaths.length === 0) {
    throw new Error('ZIP archive is empty')
  }

  const skillMdPaths = findAllSkillMdPaths(allPaths)
  if (skillMdPaths.length === 0) {
    throw new Error('No SKILL.md found in ZIP archive')
  }

  const fallbackDirName = zipFile.name.replace(/\.zip$/i, '')

  const skills = skillMdPaths.map((mdPath) =>
    buildSkillEntry(allPaths, mdPath, fallbackDirName),
  )

  for (const skill of skills) {
    if (!isValidSkillDirName(skill.dirName)) {
      throw new Error(
        `Invalid skill name "${skill.dirName}". Skill folder names must start with a letter and contain only letters, digits, and hyphens (e.g. "my-skill").`,
      )
    }
  }

  if (skills.length === 1) {
    return { isBundle: false, skill: skills[0], raw: unzipped }
  }

  return { isBundle: true, skills, raw: unzipped }
}

/**
 * Write a single skill from unzipped data to a native FS directory handle.
 *
 * @param raw         The raw unzipped entries (path → data)
 * @param targetDir   Target directory handle (e.g. .skills/<dirName>/ on native FS)
 * @param commonRoot  The common root prefix to strip from each path
 * @returns the number of files written.
 */
export async function writeZipSkillToDir(
  raw: Record<string, Uint8Array>,
  targetDir: FileSystemDirectoryHandle,
  commonRoot: string,
): Promise<number> {
  let fileCount = 0

  for (const [path, data] of Object.entries(raw)) {
    if (path.endsWith('/')) continue
    if (commonRoot && !path.startsWith(commonRoot)) continue

    const relPath = commonRoot && path.startsWith(commonRoot)
      ? path.slice(commonRoot.length)
      : path

    const parts = relPath.split('/').filter(Boolean)
    if (parts.length === 0) continue

    let currentDir = targetDir
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true })
    }

    const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(data)
    await writable.close()
    fileCount++
  }

  return fileCount
}
