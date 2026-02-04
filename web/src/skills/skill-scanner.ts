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
import { getResourceType, getMimeType, generateResourceId } from './skill-resources'
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
    const isResourceDir = ['references', 'scripts', 'assets'].includes(name)

    if (entry.kind === 'directory') {
      const subDirHandle = await dirHandle.getDirectoryHandle(name)
      // Check if this is a resource directory
      if (isResourceDir) {
        await scanResourceDirectory(subDirHandle, name, currentPath, resources, errors)
      } else {
        // Recursively scan subdirectories
        await scanDirectoryForSkillMd(subDirHandle, entryPath, skills, resources, errors)
      }
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
 * Scan a resource directory (references/, scripts/, assets/) for files.
 * Resources are stored relative to their parent skill directory.
 */
async function scanResourceDirectory(
  entry: FileSystemDirectoryHandle,
  dirName: string,
  skillDirPath: string,
  resources: SkillResource[],
  errors: string[]
): Promise<void> {
  const dirHandle = entry // Already a directory handle
  const resourceType = getResourceType(dirName)
  let totalSize = 0
  let fileCount = 0

  console.log(`[SkillScanner] Scanning resource directory: ${skillDirPath}/${dirName}`)

  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind === 'file') {
      const resourcePath = `${dirName}/${name}`
      try {
        const file = await entry.getFile()
        const size = file.size

        // Check file size limit
        if (size > RESOURCE_LIMITS.MAX_FILE_SIZE) {
          errors.push(
            `${skillDirPath}/${resourcePath}: File too large (${size} bytes, max ${RESOURCE_LIMITS.MAX_FILE_SIZE})`
          )
          continue
        }

        // Check total size limit
        if (totalSize + size > RESOURCE_LIMITS.MAX_TOTAL_SIZE) {
          errors.push(
            `${skillDirPath}/${resourcePath}: Total resources too large, skipping remaining files`
          )
          break
        }

        // Check file count limit
        if (fileCount >= RESOURCE_LIMITS.MAX_RESOURCES_PER_SKILL) {
          errors.push(
            `${skillDirPath}/${resourcePath}: Too many resource files, skipping remaining`
          )
          break
        }

        // Read file content
        const content = await file.text()
        const contentType = getMimeType(name)

        // Generate resource ID (will be updated when skill is saved)
        const resourceId = generateResourceId('pending', resourcePath)

        resources.push({
          id: resourceId,
          skillId: 'pending', // Will be updated when skill is saved
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
        errors.push(
          `${skillDirPath}/${resourcePath}: ${e instanceof Error ? e.message : String(e)}`
        )
      }
    }
  }

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
