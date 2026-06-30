/**
 * Skill Export — packages a skill directory into a downloadable ZIP.
 *
 * Supports both user skills (stored in OPFS `.skills/user/<dir>/`) and
 * project skills (stored on native FS `.skills/<dir>/` or
 * `.claude/skills/<dir>/`).
 *
 * The output ZIP preserves the skill's directory structure so it can be
 * re-imported via the existing `importUserSkillZip` — making export the
 * exact inverse of import.
 *
 * Use cases:
 *   - Share a skill with others (download ZIP, send it)
 *   - Convert a user skill to a project skill (download ZIP, then import
 *     via "Import Project Skill")
 */

import { zip, type AsyncZippable } from 'fflate'
import { parseProjectSkillId } from './project-skill-live-reader'
import { getRuntimeDirectoryHandle } from '@/native-fs'

/** OPFS root directory name for all skills */
const SKILLS_ROOT = '.skills'
/** Subdirectory under SKILLS_ROOT for user skills */
const USER_SKILLS_DIR = 'user'

/** Ignored directories when zipping a skill folder */
const IGNORED_DIRS = new Set([
  '.git', '.svn', '.hg', 'node_modules', '__pycache__', '.pytest_cache', '.venv', 'venv',
])

/**
 * Recursively collect all files from a directory handle into a flat map
 * of `relativePath -> bytes`.
 *
 * @param dir           The directory to scan
 * @param prefix        Relative path prefix (for recursion)
 * @param out           Output map
 * @param rootPrefix    The top-level directory name to prepend (e.g. "my-skill")
 */
async function collectDirFiles(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: Record<string, Uint8Array>,
  rootPrefix: string,
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === 'directory') {
      if (IGNORED_DIRS.has(name)) continue
      const subDir = await dir.getDirectoryHandle(name)
      const nextPrefix = prefix ? `${prefix}/${name}` : name
      await collectDirFiles(subDir, nextPrefix, out, rootPrefix)
      continue
    }

    // File — read as bytes
    const file = await (handle as FileSystemFileHandle).getFile()
    const data = new Uint8Array(await file.arrayBuffer())

    // Build the full zip path: rootPrefix/relativePath
    const relativePath = prefix ? `${prefix}/${name}` : name
    const zipPath = rootPrefix ? `${rootPrefix}/${relativePath}` : relativePath
    out[zipPath] = data
  }
}

/**
 * Zip a flat file map into a Blob using fflate's async `zip()`.
 *
 * Uses level 6 compression (same as OPFS backup).
 */
async function zipFiles(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    zip(files as AsyncZippable, { level: 6 }, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

/**
 * Trigger a browser download for a Blob.
 *
 * Uses the standard `<a download>` + setTimeout(revoke) pattern, same as
 * `downloadOPFSBackup` in `opfs/backup.ts`.
 */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    // Defer revoke so the download has time to start in all browsers
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

/** Extract the directory name from a skill ID. */
function getDirNameFromSkillId(skillId: string, skillName: string): string {
  // User skill: 'user:<dirName>'
  if (skillId.startsWith('user:')) {
    return skillId.slice('user:'.length)
  }
  // Project skill: 'project:<rootName>:.skills/<dir>' — take last segment
  if (skillId.startsWith('project:')) {
    const parsed = parseProjectSkillId(skillId)
    if (parsed && parsed.dirSegments.length > 0) {
      return parsed.dirSegments[parsed.dirSegments.length - 1]
    }
  }
  // Fallback: use the skill name (slug-safe in practice)
  return skillName || skillId.split(':').pop() || 'skill'
}

/**
 * Export a user skill (stored in OPFS) as a ZIP and trigger download.
 *
 * @param skillId    Skill ID (e.g. 'user:my-skill')
 * @param skillName  Display name (used for ZIP filename fallback)
 * @returns the downloaded filename
 * @throws if OPFS is unavailable or the skill directory doesn't exist
 */
export async function exportUserSkillAsZip(
  skillId: string,
  skillName: string,
): Promise<string> {
  const dirName = getDirNameFromSkillId(skillId, skillName)

  // Resolve OPFS directory: .skills/user/<dirName>/
  const opfsRoot = await navigator.storage.getDirectory()
  const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: false })
  const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: false })
  const skillDir = await userDir.getDirectoryHandle(dirName, { create: false })

  // Collect all files
  const files: Record<string, Uint8Array> = {}
  await collectDirFiles(skillDir, '', files, dirName)

  if (Object.keys(files).length === 0) {
    throw new Error(`Skill directory "${dirName}" is empty`)
  }

  // Zip
  const zipped = await zipFiles(files)
  const filename = `${dirName}.zip`
  const blob = new Blob([zipped], { type: 'application/zip' })

  triggerDownload(blob, filename)

  console.log(
    `[SkillExport] Exported user skill "${dirName}": ${Object.keys(files).length} files, ${zipped.byteLength} bytes → ${filename}`
  )

  return filename
}

/**
 * Export a project skill (stored on native FS) as a ZIP and trigger download.
 *
 * @param skillId    Project skill ID (e.g. 'project:myRoot:.skills/my-skill')
 * @param skillName  Display name (used for ZIP filename fallback)
 * @param projectId  Active project ID (for runtime handle lookup)
 * @returns the downloaded filename
 * @throws if the project handle is unavailable or the skill directory doesn't exist
 */
export async function exportProjectSkillAsZip(
  skillId: string,
  skillName: string,
  projectId: string | null | undefined,
): Promise<string> {
  const parsed = parseProjectSkillId(skillId)
  if (!parsed) {
    throw new Error(`Invalid project skill ID: ${skillId}`)
  }

  const dirName = getDirNameFromSkillId(skillId, skillName)

  // Resolve native root handle
  const rootHandle = getRuntimeDirectoryHandle(
    projectId ?? '',
    parsed.rootName,
  )
  if (!rootHandle) {
    throw new Error(
      `Project directory handle not available for root "${parsed.rootName}". ` +
      `Make sure the project is active and the directory is mounted.`
    )
  }

  // Navigate to the skill directory
  let skillDir = rootHandle
  for (const segment of parsed.dirSegments) {
    try {
      skillDir = await skillDir.getDirectoryHandle(segment)
    } catch {
      throw new Error(`Skill directory not found: ${parsed.dirSegments.join('/')}`)
    }
  }

  // Collect all files
  const files: Record<string, Uint8Array> = {}
  await collectDirFiles(skillDir, '', files, dirName)

  if (Object.keys(files).length === 0) {
    throw new Error(`Skill directory "${dirName}" is empty`)
  }

  // Zip
  const zipped = await zipFiles(files)
  const filename = `${dirName}.zip`
  const blob = new Blob([zipped], { type: 'application/zip' })

  triggerDownload(blob, filename)

  console.log(
    `[SkillExport] Exported project skill "${dirName}": ${Object.keys(files).length} files, ${zipped.byteLength} bytes → ${filename}`
  )

  return filename
}

/**
 * Export any skill as a ZIP, automatically dispatching to the correct
 * backend (OPFS for user skills, native FS for project skills).
 *
 * @param skillId    Skill ID
 * @param skillName  Display name
 * @param projectId  Active project ID (required for project skills)
 * @returns the downloaded filename
 * @throws if the skill source is unsupported or the directory is unavailable
 */
export async function exportSkillAsZip(
  skillId: string,
  skillName: string,
  projectId?: string | null,
): Promise<string> {
  if (skillId.startsWith('user:')) {
    return exportUserSkillAsZip(skillId, skillName)
  }

  if (skillId.startsWith('project:')) {
    return exportProjectSkillAsZip(skillId, skillName, projectId)
  }

  // Builtin skills are read-only and can't be exported from OPFS directly
  // (they're bundled with the app). We skip them for now.
  throw new Error(
    `Cannot export skill "${skillName}" (${skillId}): only user and project skills can be exported.`
  )
}
