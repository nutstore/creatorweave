/**
 * Skill Storage - SQLite persistence for skills.
 */

import type { StoredSkill, Skill, SkillMetadata, SkillResource } from './skill-types'
import { getSkillRepository } from '@/sqlite'

let initPromise: Promise<void> | null = null

/** Initialize SQLite for skills (with promise caching to prevent race conditions) */
async function ensureInitialized(): Promise<void> {
  if (initPromise) {
    return initPromise
  }
  initPromise = (async () => {
    try {
      const { initSQLiteDB } = await import('@/sqlite')
      await initSQLiteDB()
    } catch (error) {
      // Clear promise on error to allow retry
      initPromise = null
      throw error
    }
  })()
  return initPromise
}

/** Get all stored skills */
export async function getAllSkills(): Promise<StoredSkill[]> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.findAll()
}

/** Get all skill metadata (lightweight, no instruction/examples/templates content) */
export async function getAllSkillMetadata(): Promise<SkillMetadata[]> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.findAllMetadata()
}

/** Get a single skill by ID */
export async function getSkillById(id: string): Promise<StoredSkill | undefined> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return (await repo.findById(id)) || undefined
}

/** Save a skill (insert or update) */
export async function saveSkill(skill: Skill, rawContent: string): Promise<void> {
  await ensureInitialized()
  const repo = getSkillRepository()
  const stored: StoredSkill = {
    ...skill,
    rawContent,
    updatedAt: Date.now(),
  }
  await repo.save(stored)
}

/** Delete a skill by ID */
export async function deleteSkill(id: string): Promise<void> {
  await ensureInitialized()
  const repo = getSkillRepository()
  await repo.delete(id)
}

/** Toggle a skill's enabled status */
export async function toggleSkill(id: string, enabled: boolean): Promise<void> {
  await ensureInitialized()
  const repo = getSkillRepository()
  await repo.toggleEnabled(id, enabled)
}

/** Get skills by category */
export async function getSkillsByCategory(category: string): Promise<StoredSkill[]> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.findByCategory(category)
}

/** Get enabled skills only */
export async function getEnabledSkills(): Promise<StoredSkill[]> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.findEnabled()
}

/** Search skills by keyword */
export async function searchSkills(keyword: string): Promise<StoredSkill[]> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.search(keyword)
}

/** Clear all skills (for testing/reset) */
export async function clearAllSkills(): Promise<void> {
  await ensureInitialized()
  const repo = getSkillRepository()
  await repo.deleteAll()
}

/** Get all categories */
export async function getSkillCategories(): Promise<string[]> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.getCategories()
}

/** Extract metadata from a stored skill (for backward compatibility) */
export function skillToMetadata(skill: StoredSkill): SkillMetadata {
  return {
    id: skill.id,
    name: skill.name,
    version: skill.version,
    description: skill.description,
    author: skill.author,
    category: skill.category,
    tags: skill.tags,
    source: skill.source,
    triggers: skill.triggers,
    enabled: skill.enabled,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  }
}

//=============================================================================
// Resource Methods (for on-demand loading)
//=============================================================================

/** Get all resources for a skill */
export async function getSkillResources(skillId: string): Promise<SkillResource[]> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.getResources(skillId)
}

/** Get a specific resource by skill ID and resource path */
export async function getSkillResource(
  skillId: string,
  resourcePath: string
): Promise<SkillResource | undefined> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return (await repo.getResource(skillId, resourcePath)) || undefined
}

/** Get a resource by its composite ID */
export async function getResourceById(resourceId: string): Promise<SkillResource | undefined> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return (await repo.getResourceById(resourceId)) || undefined
}

/** Save a resource (insert or update) */
export async function saveSkillResource(resource: SkillResource): Promise<void> {
  await ensureInitialized()
  const repo = getSkillRepository()
  await repo.saveResource(resource)
}

/** Delete a resource */
export async function deleteSkillResource(resourceId: string): Promise<void> {
  await ensureInitialized()
  const repo = getSkillRepository()
  await repo.deleteResource(resourceId)
}

/** Delete all resources for a skill */
export async function deleteSkillResources(skillId: string): Promise<void> {
  await ensureInitialized()
  const repo = getSkillRepository()
  await repo.deleteResourcesForSkill(skillId)
}

/** Get resource count for a skill */
export async function getSkillResourceCount(skillId: string): Promise<number> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.getResourceCount(skillId)
}

/** Get total resource size for a skill */
export async function getSkillResourceTotalSize(skillId: string): Promise<number> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.getTotalResourceSize(skillId)
}

/** Get skill by name (case-insensitive) - for skill tools */
export async function getSkillByName(name: string): Promise<StoredSkill | undefined> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return (await repo.findByName(name)) || undefined
}

/** Get all enabled skill names - for tool enum generation */
export async function getAllEnabledSkillNames(): Promise<string[]> {
  await ensureInitialized()
  const repo = getSkillRepository()
  return await repo.getEnabledSkillNames()
}
