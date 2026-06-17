/**
 * User Skills Scanner — scans OPFS `.skills/user/` directory for user skills.
 *
 * User skills are stored as SKILL.md files (same format as project skills)
 * under `.skills/user/<skill-name>/SKILL.md` in OPFS. This module reads them
 * at runtime and returns Skill objects with `source: 'user'`.
 *
 * Unlike persistent SQLite skills, these are NOT stored in the database —
 * the OPFS files are the single source of truth. The SkillManager loads
 * them into its runtime cache on initialization.
 */

import type { Skill, SkillResource } from './skill-types'
import { parseSkillMd, slugify } from './skill-parser'
import {
  getResourceType,
  getMimeType,
  generateResourceId,
  isTextFile,
} from './skill-resources'
import { RESOURCE_LIMITS } from './skill-types'

/** OPFS root directory name for all skills */
const SKILLS_ROOT = '.skills'
/** Subdirectory under SKILLS_ROOT for user skills */
const USER_SKILLS_DIR = 'user'

/** Scan result */
export interface UserSkillScanResult {
  skills: Skill[]
  resources: SkillResource[]
  errors: string[]
}

/**
 * Get the user skills directory handle from OPFS root.
 * Returns null if `.skills/user/` does not exist (not an error).
 */
async function getUserSkillsDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const opfsRoot = await navigator.storage.getDirectory()
    const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: false })
    return await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: false })
  } catch {
    // .skills/user/ doesn't exist yet — no user skills
    return null
  }
}

/**
 * Scan `.skills/user/` for all SKILL.md files and their resources.
 *
 * Each subdirectory under `user/` is treated as a skill:
 *   .skills/user/<skill-name>/SKILL.md       (required)
 *   .skills/user/<skill-name>/scripts/*.py   (optional)
 *   .skills/user/<skill-name>/references/*.md (optional)
 *   .skills/user/<skill-name>/assets/*        (optional)
 *
 * @returns Parsed skills with source='user', resources, and any errors
 */
export async function scanUserSkills(): Promise<UserSkillScanResult> {
  const skills: Skill[] = []
  const resources: SkillResource[] = []
  const errors: string[] = []

  const userDir = await getUserSkillsDir()
  if (!userDir) {
    // No user skills directory yet — this is normal
    return { skills, resources, errors }
  }

  for await (const [name, entry] of userDir.entries()) {
    if (entry.kind !== 'directory') continue

    const skillDirHandle = await userDir.getDirectoryHandle(name)
    const result = await scanSingleUserSkill(skillDirHandle, name)

    if (result.skill) {
      skills.push(result.skill)
      resources.push(...result.resources)
      errors.push(...result.errors)
    } else if (result.errors.length > 0) {
      errors.push(...result.errors)
    }
  }

  if (skills.length > 0) {
    console.log(
      `[UserSkillsScanner] Found ${skills.length} user skill(s):`,
      skills.map((s) => s.name)
    )
  }

  return { skills, resources, errors }
}

/**
 * Scan a single user skill directory.
 */
async function scanSingleUserSkill(
  skillDirHandle: FileSystemDirectoryHandle,
  dirName: string
): Promise<{ skill: Skill | null; resources: SkillResource[]; errors: string[] }> {
  const resources: SkillResource[] = []
  const errors: string[] = []

  // Find SKILL.md
  let skillMdHandle: FileSystemFileHandle | null = null
  try {
    skillMdHandle = await skillDirHandle.getFileHandle('SKILL.md')
  } catch {
    // No SKILL.md in this directory — skip
    return { skill: null, resources, errors }
  }

  // Read and parse SKILL.md
  let content: string
  try {
    const file = await skillMdHandle.getFile()
    content = await file.text()
  } catch (e) {
    errors.push(`user/${dirName}/SKILL.md: ${e instanceof Error ? e.message : String(e)}`)
    return { skill: null, resources, errors }
  }

  const result = parseSkillMd(content, 'user')
  if (!result.skill) {
    errors.push(`user/${dirName}/SKILL.md: ${result.error ?? 'parse error'}`)
    return { skill: null, resources, errors }
  }

  // Use directory name as skill ID (it's already slug-safe)
  // ParseSkillMd generates ID from name via slugify, but directory name is
  // the authoritative ID for user skills.
  const skill = result.skill
  skill.id = `user:${dirName}`
  skill.source = 'user'

  // Scan resources (same logic as project skill scanner)
  await scanUserSkillResources(skillDirHandle, skill.id, resources, errors)

  return { skill, resources, errors }
}

/**
 * Scan resource files in a user skill directory.
 */
async function scanUserSkillResources(
  skillDirHandle: FileSystemDirectoryHandle,
  skillId: string,
  resources: SkillResource[],
  errors: string[]
): Promise<void> {
  let totalSize = 0
  let fileCount = 0

  const ignoredDirs = new Set([
    '.git', '.svn', '.hg', 'node_modules', '__pycache__', '.pytest_cache', '.venv', 'venv',
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

      // Skip SKILL.md — it's the skill instruction, not a resource
      if (name.toUpperCase() === 'SKILL.MD') continue

      const resourcePath = relativeDir ? `${relativeDir}/${name}` : name

      try {
        const file = await entry.getFile()
        const size = file.size

        if (size > RESOURCE_LIMITS.MAX_FILE_SIZE) {
          errors.push(`${skillId}/${resourcePath}: File too large (${size} bytes)`)
          continue
        }
        if (totalSize + size > RESOURCE_LIMITS.MAX_TOTAL_SIZE) {
          errors.push(`${skillId}/${resourcePath}: Total resources too large, skipping`)
          break
        }
        if (fileCount >= RESOURCE_LIMITS.MAX_RESOURCES_PER_SKILL) {
          errors.push(`${skillId}/${resourcePath}: Too many resource files, skipping`)
          break
        }

        if (!isTextFile(name)) {
          // Binary resources are available via OPFS but not loaded as text
          continue
        }

        const fileContent = await file.text()
        const contentType = getMimeType(name)
        const topLevelDir = resourcePath.split('/')[0] || ''
        const resourceType = getResourceType(topLevelDir)

        resources.push({
          id: generateResourceId(skillId, resourcePath),
          skillId,
          resourcePath,
          resourceType,
          content: fileContent,
          contentType,
          size,
          createdAt: Date.now(),
        })

        totalSize += size
        fileCount++
      } catch (e) {
        errors.push(`${skillId}/${resourcePath}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  await scanRecursive(skillDirHandle, '')
}

/**
 * Derive the OPFS directory name for a skill.
 *
 * Uses the shared `slugify` function (same logic used by `parseSkillMd` to
 * generate a skill ID from its name, and by `importSkillMd` in the store).
 * This ensures that migration, import, and manual creation all derive the
 * **same** directory name from a given skill name, preventing duplicates.
 *
 * Skill names already use `cw-` kebab-case (filesystem-safe), so in practice
 * `slugify(name)` returns the name unchanged for well-formed names.
 *
 * @param name  Skill display name (e.g. `cw-my-skill`)
 * @param id    Skill ID (used only as a fallback if name is empty)
 */
function deriveDirName(name: string, id: string): string {
  // Prefer the name — it's what import/create use to derive the dir.
  // Fall back to the ID segment after the last ':' (e.g. legacy `user:foo`).
  const candidate = name || id.split(':').pop() || ''
  return slugify(candidate)
}

/**
 * Migrate user skills from SQLite to OPFS `.skills/user/`.
 *
 * Older versions of the app stored user-created skills in the SQLite `skills`
 * table with `source = 'user'`. The current architecture uses OPFS
 * `.skills/user/<dir>/SKILL.md` as the single source of truth.
 *
 * This function:
 *   1. Queries SQLite for `source = 'user'` skills
 *   2. For each, writes SKILL.md + resources to OPFS (if not already present)
 *   3. Deletes the record from SQLite (after successful OPFS write)
 *
 * The migration is idempotent — if the OPFS directory already exists,
 * the skill is treated as already migrated and the SQLite record is pruned.
 *
 * @returns Summary of migrated/pruned skills
 */
export async function migrateUserSkillsFromSQLite(): Promise<{
  migrated: string[]
  pruned: string[]
  errors: string[]
}> {
  const migrated: string[] = []
  const pruned: string[] = []
  const errors: string[] = []

  // Import lazily to avoid circular dependencies during module init
  const { getSkillRepository } = await import('@/sqlite')
  const repo = getSkillRepository()

  let legacySkills
  try {
    legacySkills = await repo.findBySource('user')
  } catch (e) {
    // SQLite not ready or table missing — nothing to migrate
    errors.push(`findBySource failed: ${e instanceof Error ? e.message : String(e)}`)
    return { migrated, pruned, errors }
  }

  if (legacySkills.length === 0) {
    return { migrated, pruned, errors }
  }

  console.log(
    `[UserSkillsScanner] Migrating ${legacySkills.length} user skill(s) from SQLite to OPFS`
  )

  const opfsRoot = await navigator.storage.getDirectory()
  const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: true })
  const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: true })

  for (const skill of legacySkills) {
    const dirName = deriveDirName(skill.name, skill.id)
    if (!dirName) {
      errors.push(`Skill ${skill.id}: could not derive directory name`)
      continue
    }

    try {
      // Check if OPFS directory already exists (already migrated)
      let skillDir: FileSystemDirectoryHandle
      try {
        skillDir = await userDir.getDirectoryHandle(dirName)
        // Directory exists — skill was already migrated, just prune SQLite
        await repo.delete(skill.id)
        pruned.push(skill.id)
        continue
      } catch {
        // Not found — create it
        skillDir = await userDir.getDirectoryHandle(dirName, { create: true })
      }

      // Write SKILL.md (prefer rawContent, fallback to re-serialised instruction)
      const skillMdContent =
        skill.rawContent ||
        skill.instruction ||
        `# ${skill.name}\n\n${skill.description || ''}\n`
      const mdHandle = await skillDir.getFileHandle('SKILL.md', { create: true })
      const writable = await mdHandle.createWritable()
      await writable.write(skillMdContent)
      await writable.close()

      // Write resource files
      let resources: SkillResource[]
      try {
        resources = await repo.getResources(skill.id)
      } catch {
        resources = []
      }
      for (const resource of resources) {
        try {
          const parts = resource.resourcePath.split('/').filter(Boolean)
          const fileName = parts.pop()!
          let dir = skillDir
          for (const part of parts) {
            dir = await dir.getDirectoryHandle(part, { create: true })
          }
          const resHandle = await dir.getFileHandle(fileName, { create: true })
          const rw = await resHandle.createWritable()
          await rw.write(resource.content)
          await rw.close()
        } catch (e) {
          errors.push(
            `Skill ${skill.id} resource ${resource.resourcePath}: ${e instanceof Error ? e.message : String(e)}`
          )
        }
      }

      // Migration of this skill succeeded — delete from SQLite
      await repo.delete(skill.id)
      migrated.push(skill.id)
      console.log(`[UserSkillsScanner] Migrated user skill: ${skill.id} → .skills/user/${dirName}/`)
    } catch (e) {
      errors.push(`Skill ${skill.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  console.log(
    `[UserSkillsScanner] Migration complete: ${migrated.length} migrated, ${pruned.length} pruned, ${errors.length} errors`
  )

  return { migrated, pruned, errors }
}

/**
 * Write a user skill SKILL.md to OPFS `.skills/user/<dirName>/SKILL.md`.
 * Creates intermediate directories as needed.
 *
 * @param dirName  Skill directory name (slug-safe)
 * @param content  SKILL.md file content
 */
export async function writeUserSkillMd(dirName: string, content: string): Promise<void> {
 const opfsRoot = await navigator.storage.getDirectory()
 const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: true })
 const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: true })
 const skillDir = await userDir.getDirectoryHandle(dirName, { create: true })
 const mdHandle = await skillDir.getFileHandle('SKILL.md', { create: true })
 const writable = await mdHandle.createWritable()
 await writable.write(content)
 await writable.close()
}

/**
 * Delete a user skill directory from OPFS `.skills/user/<dirName>/`.
 *
 * @param dirName  Skill directory name (slug-safe)
 */
export async function deleteUserSkillDir(dirName: string): Promise<void> {
 const opfsRoot = await navigator.storage.getDirectory()
 const skillsDir = await opfsRoot.getDirectoryHandle(SKILLS_ROOT, { create: false })
 const userDir = await skillsDir.getDirectoryHandle(USER_SKILLS_DIR, { create: false })
 await userDir.removeEntry(dirName, { recursive: true })
}

/**
 * Check if a user skill directory exists in OPFS.
 * Used for validation before write operations.
 */
export async function userSkillDirExists(skillDirName: string): Promise<boolean> {
  try {
    const userDir = await getUserSkillsDir()
    if (!userDir) return false
    await userDir.getDirectoryHandle(skillDirName)
    return true
  } catch {
    return false
  }
}
