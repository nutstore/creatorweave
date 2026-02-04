/**
 * Skill Scanner - scans project directories for SKILL.md files.
 *
 * Looks for:
 * - .claude/skills/ and subdirectories (recursively)
 * - .skills/ and subdirectories (recursively)
 *
 * Only scans files named SKILL.md (not other .md files).
 * These are loaded as 'project' source skills.
 */

import type { Skill } from './skill-types'
import { parseSkillMd } from './skill-parser'

/**
 * Scan a project directory handle for skill files.
 * Returns parsed skills found in the project.
 */
export async function scanProjectSkills(
  rootHandle: FileSystemDirectoryHandle
): Promise<{ skills: Skill[]; errors: string[] }> {
  const skills: Skill[] = []
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
      await scanDirectoryForSkillMd(dirHandle, dirPath, skills, errors)
    } catch (e) {
      errors.push(
        `Failed to read directory ${dirPath}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  console.log(`[SkillScanner] Scan complete: ${skills.length} skills, ${errors.length} errors`)

  return { skills, errors }
}

/**
 * Recursively scan a directory for SKILL.md files.
 * Only processes files named exactly "SKILL.md" (case-insensitive).
 */
async function scanDirectoryForSkillMd(
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string,
  skills: Skill[],
  errors: string[]
): Promise<void> {
  for await (const [name, entry] of dirHandle.entries()) {
    const entryPath = `${currentPath}/${name}`
    const isSkillMd = name.toUpperCase() === 'SKILL.MD'

    if (entry.kind === 'directory') {
      // Recursively scan subdirectories
      const subDirHandle = await dirHandle.getDirectoryHandle(name)
      await scanDirectoryForSkillMd(subDirHandle, entryPath, skills, errors)
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
