/**
 * Project Skill Live Reader
 *
 * Reads project skill files (SKILL.md + resources) directly from native FS
 * at tool-call time, bypassing the in-memory cache that may be stale.
 *
 * Project skill IDs follow these formats (set in WorkspaceLayout.tsx):
 *   project:{rootName}:.skills/{skill-dir}
 *   project:{rootName}:.claude/skills/{skill-dir}
 *
 * This module resolves the native directory handle via the runtime handle
 * registry, then reads the files in real time — mirroring how builtin/user
 * skills already read from OPFS.
 */

import type { ToolContext } from '@/agent/tools/tool-types'
import { getRuntimeDirectoryHandle } from '@/native-fs'
import {
  getResourceType,
  getMimeType,
  isTextFile,
} from './skill-resources'

/** Live resource metadata (no content loaded) */
export interface ProjectSkillResourceMeta {
  resourcePath: string
  resourceType: 'reference' | 'script' | 'asset'
  size: number
}

/** Live resource with content (text only; binary returns metadata) */
export interface ProjectSkillResourceData extends ProjectSkillResourceMeta {
  content: string
  contentType: string
}

/** Result of parsing a project skill ID into navigable path segments */
export interface ParsedProjectSkillPath {
  /** Root name for handle lookup */
  rootName: string
  /** Directory path segments from the root (e.g. ['.skills', 'my-skill']) */
  dirSegments: string[]
}

/**
 * Parse a project skill ID into root name + directory segments.
 *
 * @example
 *   'project:myRoot:.skills/my-skill' → { rootName: 'myRoot', dirSegments: ['.skills', 'my-skill'] }
 *   'project:myRoot:.claude/skills/my-skill' → { rootName: 'myRoot', dirSegments: ['.claude', 'skills', 'my-skill'] }
 * @returns null if the ID format is not a recognised project skill ID
 */
export function parseProjectSkillId(skillId: string): ParsedProjectSkillPath | null {
  // Strip leading 'project:'
  if (!skillId.startsWith('project:')) return null
  const rest = skillId.slice('project:'.length)

  // The remainder is '{rootName}:.skills/...' or '{rootName}:.claude/skills/...'
  const colonIdx = rest.indexOf(':')
  if (colonIdx <= 0) return null

  const rootName = rest.slice(0, colonIdx)
  const dirPath = rest.slice(colonIdx + 1)
  const dirSegments = dirPath.split('/').filter(Boolean)
  if (dirSegments.length === 0) return null

  return { rootName, dirSegments }
}

/**
 * Resolve the root directory handle for a project skill from the runtime
 * handle registry. Returns null if the handle is not available.
 *
 * Accepts either a ToolContext (for tool-call paths) or an explicit projectId
 * (for store/UI paths that don't have a full ToolContext).
 */
async function resolveRootHandle(
  parsed: ParsedProjectSkillPath,
  contextOrProjectId: ToolContext | string | null | undefined
): Promise<FileSystemDirectoryHandle | null> {
  // Extract projectId from either a ToolContext or a bare string.
  const projectId =
    typeof contextOrProjectId === 'string'
      ? contextOrProjectId
      : contextOrProjectId?.projectId ?? null
  if (!projectId) return null

  // Resolve handle via runtime registry (sync).
  let rootHandle: FileSystemDirectoryHandle | null =
    getRuntimeDirectoryHandle(projectId, parsed.rootName)

  // Fallback to the legacy single-root handle passed in ToolContext.
  if (!rootHandle && contextOrProjectId && typeof contextOrProjectId !== 'string') {
    if (contextOrProjectId.directoryHandle) {
      rootHandle = contextOrProjectId.directoryHandle
    }
  }
  return rootHandle
}

/**
 * Resolve the native directory handle for a parsed project skill path.
 * Returns null if the handle is not available (project not active, revoked, etc.)
 */
async function resolveSkillDirHandle(
  parsed: ParsedProjectSkillPath,
  context: ToolContext
): Promise<FileSystemDirectoryHandle | null> {
  const rootHandle = await resolveRootHandle(parsed, context)
  if (!rootHandle) return null

  // Navigate into the skill directory.
  let current = rootHandle
  for (const segment of parsed.dirSegments) {
    try {
      current = await current.getDirectoryHandle(segment)
    } catch {
      return null
    }
  }
  return current
}

/**
 * Read the SKILL.md for a project skill directly from native FS.
 * Returns the raw text content, or null if not found / unavailable.
 */
export async function readProjectSkillMdFromNativeFs(
  skillId: string,
  context: ToolContext
): Promise<string | null> {
  const parsed = parseProjectSkillId(skillId)
  if (!parsed) return null

  const dirHandle = await resolveSkillDirHandle(parsed, context)
  if (!dirHandle) return null

  try {
    const fileHandle = await dirHandle.getFileHandle('SKILL.md')
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

/**
 * List all resource files for a project skill from native FS (no content).
 * Mirrors listUserSkillResourcesFromOPFS but reads from the native project dir.
 */
export async function listProjectSkillResourcesFromNativeFs(
  skillId: string,
  context: ToolContext
): Promise<ProjectSkillResourceMeta[]> {
  const parsed = parseProjectSkillId(skillId)
  if (!parsed) return []

  const dirHandle = await resolveSkillDirHandle(parsed, context)
  if (!dirHandle) return []

  const resources: ProjectSkillResourceMeta[] = []
  const ignoredDirs = new Set([
    '.git', '.svn', '.hg', 'node_modules', '__pycache__', '.pytest_cache', '.venv', 'venv',
  ])

  const scanRecursive = async (
    dir: FileSystemDirectoryHandle,
    prefix: string
  ): Promise<void> => {
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'directory') {
        if (ignoredDirs.has(name)) continue
        await scanRecursive(handle as FileSystemDirectoryHandle, prefix ? `${prefix}/${name}` : name)
        continue
      }
      // Skip SKILL.md (instruction) and hidden files
      if (name.toUpperCase() === 'SKILL.MD') continue
      if (name.startsWith('.')) continue

      const resourcePath = prefix ? `${prefix}/${name}` : name
      let size = 0
      try {
        const file = await (handle as FileSystemFileHandle).getFile()
        size = file.size
      } catch { /* keep size 0 */ }

      const topDir = resourcePath.split('/')[0] || ''
      resources.push({
        resourcePath,
        resourceType: getResourceType(topDir),
        size,
      })
    }
  }

  try {
    await scanRecursive(dirHandle, '')
  } catch {
    // directory read failed — return whatever we collected
  }
  return resources
}

/**
 * Read a specific resource file for a project skill from native FS.
 * Binary files return metadata only (no text content).
 *
 * @returns resource data with content, or null if not found
 */
export async function readProjectSkillResourceFromNativeFs(
  skillId: string,
  resourcePath: string,
  context: ToolContext
): Promise<ProjectSkillResourceData | null> {
  const parsed = parseProjectSkillId(skillId)
  if (!parsed) return null

  const dirHandle = await resolveSkillDirHandle(parsed, context)
  if (!dirHandle) return null

  // Navigate to the file via path segments
  const parts = resourcePath.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const fileName = parts.pop()!

  let currentDir = dirHandle
  for (const part of parts) {
    try {
      currentDir = await currentDir.getDirectoryHandle(part)
    } catch {
      return null
    }
  }

  try {
    const fileHandle = await currentDir.getFileHandle(fileName)
    const file = await fileHandle.getFile()

    if (!isTextFile(fileName)) {
      // Binary file — return metadata only (content not loaded as text)
      const topDir = resourcePath.split('/')[0] || ''
      return {
        resourcePath,
        resourceType: getResourceType(topDir),
        size: file.size,
        content: `[binary file: ${file.size} bytes, not loaded as text]`,
        contentType: getMimeType(fileName),
      }
    }

    const content = await file.text()
    const topDir = resourcePath.split('/')[0] || ''
    return {
      resourcePath,
      resourceType: getResourceType(topDir),
      size: file.size,
      content,
      contentType: getMimeType(fileName),
    }
  } catch {
    return null
  }
}

/**
 * Delete a project skill directory from native FS.
 *
 * Navigates to the PARENT of the skill directory, then removes the skill
 * folder recursively. This mirrors how user skills are deleted
 * (`deleteUserSkillDir`).
 *
 * @param skillId    Project skill ID (e.g. 'project:myRoot:.skills/my-skill')
 * @param projectId  Active project ID (for runtime handle lookup)
 * @returns true if deleted, false if the directory was not found / handle unavailable
 */
export async function deleteProjectSkillFromNativeFs(
  skillId: string,
  projectId: string | null | undefined
): Promise<boolean> {
  const parsed = parseProjectSkillId(skillId)
  if (!parsed) return false

  const rootHandle = await resolveRootHandle(parsed, projectId)
  if (!rootHandle) return false

  // Navigate to the PARENT directory of the skill folder.
  // dirSegments is e.g. ['.skills', 'my-skill'] — parent is ['.skills'].
  if (parsed.dirSegments.length === 0) return false
  const skillDirName = parsed.dirSegments[parsed.dirSegments.length - 1]
  const parentSegments = parsed.dirSegments.slice(0, -1)

  let parentDir = rootHandle
  for (const segment of parentSegments) {
    try {
      parentDir = await parentDir.getDirectoryHandle(segment)
    } catch {
      return false
    }
  }

  try {
    await parentDir.removeEntry(skillDirName, { recursive: true })
    return true
  } catch {
    return false
  }
}
