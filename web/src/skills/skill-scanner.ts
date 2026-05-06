/**
 * Skill Scanner - scans project directories for SKILL.md files.
 *
 * Looks for:
 * - .claude/skills/ and subdirectories (recursively)
 * - .skills/ and subdirectories (recursively)
 *
 * For each skill found, also scans for resource files in:
 * - references/ - documentation and reference materials
 * - scripts/ - executable scripts and code
 * - assets/ - images, configs, and other assets
 *
 * Only scans files named SKILL.md (not other .md files).
 * These are loaded as 'project' source skills.
 */

import type { Skill, SkillResource } from './skill-types'
import { parseSkillMd } from './skill-parser'
import { getResourceType, getMimeType, generateResourceId, isTextFile } from './skill-resources'
import { RESOURCE_LIMITS } from './skill-types'

/**
 * Scan result with skills and their associated resources
 */
export interface SkillScanResult {
  skills: Skill[]
  resources: SkillResource[]
  errors: string[]
}

/**
 * Scan a project directory handle for skill files and their resources.
 * Returns parsed skills found in the project along with any resource files.
 */
export async function scanProjectSkills(
  rootHandle: FileSystemDirectoryHandle
): Promise<SkillScanResult> {
  const skills: Skill[] = []
  const resources: SkillResource[] = []
  const errors: string[] = []

  // Directories to scan for skills
  const skillDirs = [['.claude', 'skills'], ['.skills']]

  console.log(
    '[SkillScanner] Scanning directories for SKILL.md files:',
    skillDirs.map((d) => d.join('/'))
  )

  for (const pathParts of skillDirs) {
    const dirPath = pathParts.join('/')
    const dirHandle = await resolveDirectory(rootHandle, pathParts)

    if (!dirHandle) {
      console.log(`[SkillScanner] Directory not found: ${dirPath}`)
      continue
    }

    console.log(`[SkillScanner] Found directory: ${dirPath}, scanning for SKILL.md...`)

    try {
      await scanDirectoryForSkillMd(dirHandle, dirPath, skills, resources, errors)
    } catch (e) {
      errors.push(
        `Failed to read directory ${dirPath}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  console.log(
    `[SkillScanner] Scan complete: ${skills.length} skills, ${resources.length} resources, ${errors.length} errors`
  )

  return { skills, resources, errors }
}

/**
 * Recursively scan a directory for SKILL.md files and resource directories.
 * Only processes files named exactly "SKILL.md" (case-insensitive).
 * When a SKILL.md is found, also scans sibling directories for resources.
 */
async function scanDirectoryForSkillMd(
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string,
  skills: Skill[],
  resources: SkillResource[],
  errors: string[]
): Promise<void> {
  for await (const [name, entry] of dirHandle.entries()) {
    const entryPath = `${currentPath}/${name}`
    const isSkillMd = name.toUpperCase() === 'SKILL.MD'

    if (entry.kind === 'directory') {
      const subDirHandle = await dirHandle.getDirectoryHandle(name)
      // Recursively scan subdirectories
      await scanDirectoryForSkillMd(subDirHandle, entryPath, skills, resources, errors)
    } else if (entry.kind === 'file' && isSkillMd) {
      console.log(`[SkillScanner] Found SKILL.md: ${entryPath}`)

      try {
        const file = await entry.getFile()
        const content = await file.text()
        const result = parseSkillMd(content, 'project')

        if (result.skill) {
          // Prefix ID with project source and full path (excluding SKILL.md)
          const dirPath = currentPath
          result.skill.id = `project:${dirPath}`
          skills.push(result.skill)
          console.log(`[SkillScanner] Parsed skill: ${result.skill.name} (${result.skill.id})`)
          await scanSkillDirectoryResources(
            dirHandle,
            dirPath,
            result.skill.id,
            resources,
            errors
          )
        } else if (result.error) {
          errors.push(`${entryPath}: ${result.error}`)
        }
      } catch (e) {
        errors.push(`${entryPath}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
}

/**
 * Scan all files under a skill directory recursively.
 * Stores resources relative to the skill root (excluding SKILL.md).
 */
async function scanSkillDirectoryResources(
  skillDirHandle: FileSystemDirectoryHandle,
  skillDirPath: string,
  skillId: string,
  resources: SkillResource[],
  errors: string[]
): Promise<void> {
  let totalSize = 0
  let fileCount = 0

  console.log(`[SkillScanner] Scanning skill resources: ${skillDirPath}`)

  const ignoredDirs = new Set([
    '.git',
    '.svn',
    '.hg',
    'node_modules',
    '__pycache__',
    '.pytest_cache',
    '.venv',
    'venv',
  ])

  const scanRecursive = async (
    dirHandle: FileSystemDirectoryHandle,
    relativeDir: string
  ): Promise<void> => {
    for await (const [name, entry] of dirHandle.entries()) {
      if (entry.kind === 'directory') {
        if (ignoredDirs.has(name)) continue

        const subDir = await dirHandle.getDirectoryHandle(name)
        const nextRelativeDir = relativeDir ? `${relativeDir}/${name}` : name
        await scanRecursive(subDir, nextRelativeDir)
        continue
      }

      if (name.toUpperCase() === 'SKILL.MD') continue

      const resourcePath = relativeDir ? `${relativeDir}/${name}` : name

      try {
        const file = await entry.getFile()
        const size = file.size

        if (size > RESOURCE_LIMITS.MAX_FILE_SIZE) {
          errors.push(
            `${skillDirPath}/${resourcePath}: File too large (${size} bytes, max ${RESOURCE_LIMITS.MAX_FILE_SIZE})`
          )
          continue
        }

        if (totalSize + size > RESOURCE_LIMITS.MAX_TOTAL_SIZE) {
          errors.push(
            `${skillDirPath}/${resourcePath}: Total resources too large, skipping remaining files`
          )
          break
        }

        if (fileCount >= RESOURCE_LIMITS.MAX_RESOURCES_PER_SKILL) {
          errors.push(
            `${skillDirPath}/${resourcePath}: Too many resource files, skipping remaining`
          )
          break
        }

        // Only process known text files — binary resources are synced to OPFS
        // separately by syncSkillsDirToOPFS() and must not be read as UTF-8 text.
        if (!isTextFile(name)) {
          console.log(`[SkillScanner] Skipping binary resource: ${resourcePath}`)
          continue
        }

        const content = await file.text()
        const contentType = getMimeType(name)
        const topLevelDir = resourcePath.split('/')[0] || ''
        const resourceType = getResourceType(topLevelDir)

        resources.push({
          id: generateResourceId(skillId, resourcePath),
          skillId,
          resourcePath,
          resourceType,
          content,
          contentType,
          size,
          createdAt: Date.now(),
        })

        totalSize += size
        fileCount++
        console.log(`[SkillScanner] Found resource: ${resourcePath} (${size} bytes)`)
      } catch (e) {
        errors.push(`${skillDirPath}/${resourcePath}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  await scanRecursive(skillDirHandle, '')
  console.log(`[SkillScanner] Resource scan complete: ${fileCount} files, ${totalSize} bytes`)
}

/**
 * Resolve a nested directory path from a root handle.
 * Returns null if any segment doesn't exist.
 */
async function resolveDirectory(
  root: FileSystemDirectoryHandle,
  pathParts: string[]
): Promise<FileSystemDirectoryHandle | null> {
  let current = root
  for (const part of pathParts) {
    try {
      current = await current.getDirectoryHandle(part)
    } catch {
      return null
    }
  }
  return current
}

/**
 * Sync skill resource files to OPFS so Pyodide can access them at /mnt/.skills/.
 * Uses existing scan result. Called after skill scanning in WorkspaceLayout.
 */
export async function syncResourcesToOPFS(
  result: SkillScanResult
): Promise<void> {
  if (result.resources.length === 0) return

  const { getActiveWorkspace } = await import('@/store/workspace.store')
  const active = await getActiveWorkspace()
  if (!active) {
    console.warn('[SkillScanner] No active workspace, skipping OPFS sync')
    return
  }

  await syncResourcesToFilesDir(result.resources, await active.workspace.getFilesDir())
}

/**
 * Sync .skills/ directory from native FS to the current active workspace's OPFS.
 * Called from WorkspaceLayout to ensure all workspaces have skill files available.
 */
export async function syncProjectSkillsToActiveWorkspace(
  rootHandle: FileSystemDirectoryHandle,
  workspaceId?: string | null
): Promise<void> {
  let targetFilesDir: FileSystemDirectoryHandle | null = null

  if (workspaceId) {
    const { getWorkspaceManager } = await import('@/opfs/workspace')
    const manager = await getWorkspaceManager()
    let workspace = await manager.getWorkspace(workspaceId)
    // New conversation workspace creation is async; wait briefly before giving up.
    if (!workspace) {
      for (let i = 0; i < 20; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        workspace = await manager.getWorkspace(workspaceId)
        if (workspace) break
      }
    }
    if (workspace) {
      targetFilesDir = await workspace.getFilesDir()
      console.log(`[SkillScanner] Syncing .skills to explicit workspace: ${workspaceId}`)
    } else {
      console.warn(`[SkillScanner] Explicit workspace not found after wait: ${workspaceId}, skipping sync`)
      return
    }
  }

  if (!targetFilesDir) {
    const { getActiveWorkspace } = await import('@/store/workspace.store')
    const active = await getActiveWorkspace()
    if (!active) return
    targetFilesDir = await active.workspace.getFilesDir()
    console.log(`[SkillScanner] Syncing .skills to active workspace: ${active.workspaceId}`)
  }

  await syncSkillsDirToOPFS(targetFilesDir, rootHandle)
}

/**
 * Sync .skills/ directory from native FS directly to a workspace's OPFS files/ dir.
 * Used when creating a new workspace so skills are available immediately in Pyodide.
 */
export async function syncSkillsDirToOPFS(
  filesDir: FileSystemDirectoryHandle,
  rootHandle: FileSystemDirectoryHandle
): Promise<void> {
  const ignoredDirs = new Set(['.git', 'node_modules', '__pycache__'])

  for (const skillDirPath of ['.skills']) {
    const dirHandle = await resolveDirectory(rootHandle, [skillDirPath])
    if (!dirHandle) continue

    console.log(`[SkillScanner] Syncing ${skillDirPath}/ to OPFS for new workspace`)
    let count = 0

    const syncRecursive = async (
      srcDir: FileSystemDirectoryHandle,
      destDir: FileSystemDirectoryHandle
    ): Promise<void> => {
      for await (const [name, entry] of srcDir.entries()) {
        if (name.toUpperCase() === 'SKILL.MD') continue

        if (entry.kind === 'directory') {
          if (ignoredDirs.has(name)) continue
          const subSrc = await srcDir.getDirectoryHandle(name)
          const subDest = await destDir.getDirectoryHandle(name, { create: true })
          await syncRecursive(subSrc, subDest)
        } else if (entry.kind === 'file') {
          const file = await entry.getFile()
          if (file.size > RESOURCE_LIMITS.MAX_FILE_SIZE) continue

          // Write File object directly — preserves binary content for
          // .docx, .png, .wasm, etc. (was previously broken by file.text())
          const fileHandle = await destDir.getFileHandle(name, { create: true })
          const writable = await fileHandle.createWritable()
          await writable.write(file)
          await writable.close()
          count++
        }
      }
    }

    // Create .skills/ in files/ and sync
    const opfsSkillsDir = await filesDir.getDirectoryHandle(skillDirPath, { create: true })
    await syncRecursive(dirHandle, opfsSkillsDir)
    console.log(`[SkillScanner] Synced ${count} files from ${skillDirPath}/ to OPFS`)
  }
}

/**
 * Write resource list to OPFS files/ directory.
 */
async function syncResourcesToFilesDir(
  resources: SkillResource[],
  filesDir: FileSystemDirectoryHandle
): Promise<void> {
  for (const resource of resources) {
    const skillDir = resource.skillId.replace(/^project:/, '')
    const opfsPath = `${skillDir}/${resource.resourcePath}`

    try {
      const parts = opfsPath.split('/')
      let currentDir = filesDir
      for (let i = 0; i < parts.length - 1; i++) {
        currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true })
      }

      const fileName = parts[parts.length - 1]
      const fileHandle = await currentDir.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(resource.content)
      await writable.close()
    } catch (err) {
      console.warn(
        `[SkillScanner] Failed to sync ${opfsPath}:`,
        err instanceof Error ? err.message : String(err)
      )
    }
  }
  console.log(`[SkillScanner] OPFS sync complete: ${resources.length} resources`)
}
