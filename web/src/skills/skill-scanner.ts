/**
 * Skill Scanner - scans project directories for SKILL.md files.
 *
 * Looks for:
 * - .claude/skills/*.md
 * - .skills/*.md
 *
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

  for (const pathParts of skillDirs) {
    const dirHandle = await resolveDirectory(rootHandle, pathParts)
    if (!dirHandle) continue

    try {
      for await (const [name, entry] of dirHandle.entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.md')) continue

        try {
          const file = await entry.getFile()
          const content = await file.text()
          const result = parseSkillMd(content, 'project')

          if (result.skill) {
            // Prefix ID with project source
            result.skill.id = `project:${result.skill.id}`
            skills.push(result.skill)
          } else if (result.error) {
            errors.push(`${entry.name}: ${result.error}`)
          }
        } catch (e) {
          errors.push(`${entry.name}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    } catch (e) {
      errors.push(`Failed to read directory: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { skills, errors }
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
