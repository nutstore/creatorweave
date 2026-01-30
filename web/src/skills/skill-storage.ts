/**
 * Skill Storage - IndexedDB persistence for skills.
 *
 * Uses the `idb` library (already in dependencies) for a clean promise-based API.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { StoredSkill, Skill, SkillMetadata } from './skill-types'
import { SKILLS_DB_NAME, SKILLS_DB_VERSION, SKILLS_STORE_NAME } from './skill-types'

type SkillsDB = IDBPDatabase

let dbPromise: Promise<SkillsDB> | null = null

/** Open or create the skills database */
function getDB(): Promise<SkillsDB> {
  if (!dbPromise) {
    dbPromise = openDB(SKILLS_DB_NAME, SKILLS_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SKILLS_STORE_NAME)) {
          const store = db.createObjectStore(SKILLS_STORE_NAME, { keyPath: 'id' })
          store.createIndex('category', 'category', { unique: false })
          store.createIndex('source', 'source', { unique: false })
          store.createIndex('enabled', 'enabled', { unique: false })
        }
      },
    })
  }
  return dbPromise
}

/** Get all stored skills */
export async function getAllSkills(): Promise<StoredSkill[]> {
  const db = await getDB()
  return db.getAll(SKILLS_STORE_NAME)
}

/** Get all skill metadata (lightweight, no instruction/examples/templates content) */
export async function getAllSkillMetadata(): Promise<SkillMetadata[]> {
  const skills = await getAllSkills()
  return skills.map(skillToMetadata)
}

/** Get a single skill by ID */
export async function getSkillById(id: string): Promise<StoredSkill | undefined> {
  const db = await getDB()
  return db.get(SKILLS_STORE_NAME, id)
}

/** Save a skill (insert or update) */
export async function saveSkill(skill: Skill, rawContent: string): Promise<void> {
  const db = await getDB()
  const stored: StoredSkill = {
    ...skill,
    rawContent,
    updatedAt: Date.now(),
  }
  await db.put(SKILLS_STORE_NAME, stored)
}

/** Delete a skill by ID */
export async function deleteSkill(id: string): Promise<void> {
  const db = await getDB()
  await db.delete(SKILLS_STORE_NAME, id)
}

/** Toggle a skill's enabled status */
export async function toggleSkill(id: string, enabled: boolean): Promise<void> {
  const db = await getDB()
  const skill = await db.get(SKILLS_STORE_NAME, id)
  if (skill) {
    skill.enabled = enabled
    skill.updatedAt = Date.now()
    await db.put(SKILLS_STORE_NAME, skill)
  }
}

/** Get skills by category */
export async function getSkillsByCategory(category: string): Promise<StoredSkill[]> {
  const db = await getDB()
  return db.getAllFromIndex(SKILLS_STORE_NAME, 'category', category)
}

/** Get enabled skills only */
export async function getEnabledSkills(): Promise<StoredSkill[]> {
  const all = await getAllSkills()
  return all.filter((s) => s.enabled)
}

/** Clear all skills (for testing/reset) */
export async function clearAllSkills(): Promise<void> {
  const db = await getDB()
  await db.clear(SKILLS_STORE_NAME)
}

/** Extract metadata from a stored skill */
function skillToMetadata(skill: StoredSkill): SkillMetadata {
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
