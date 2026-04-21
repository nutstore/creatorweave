/**
 * Skill Manager - lifecycle management and Agent integration.
 *
 * Responsibilities:
 * - Initialize skills system (load from SQLite + seed builtins)
 * - Scan project directory for skills
 * - Match skills to conversation context
 * - Build skills block for system prompt (metadata-only, on-demand loading)
 */

import type { Skill, SkillMetadata, SkillMatchContext } from './skill-types'
import * as storage from './skill-storage'
import {
  buildAvailableSkillsBlock,
  buildAvailableSkillsBlockWithRecommendations,
  matchSkillsForRecommendation,
  type SessionSkillState,
} from './skill-injection'
import { scanProjectSkills } from './skill-scanner'
import { BUILTIN_SKILLS } from './builtin-skills'
import { generateResourceId } from './skill-resources'

export class SkillManager {
  private _initialized = false
  private cachedSkills: Skill[] = []
  private initPromise: Promise<void> | null = null

  /** Check if the skill manager has been initialized */
  get initialized(): boolean {
    return this._initialized
  }

  /**
   * Initialize the skill system.
   * Loads skills from SQLite and seeds builtins if needed.
   * Safe to call multiple times - subsequent calls will await the same promise.
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this._initialized) return

    // If initialization is in progress, await the same promise
    if (this.initPromise) return this.initPromise

    // Start initialization
    this.initPromise = this._doInitialize()
    await this.initPromise
    this.initPromise = null
  }

  private async _doInitialize(): Promise<void> {
    try {
      console.log(
        '[SkillManager] _doInitialize: starting, seeding',
        BUILTIN_SKILLS.length,
        'builtin skills'
      )
      // Seed builtin skills if they don't exist yet
      for (const builtin of BUILTIN_SKILLS) {
        const existing = await storage.getSkillById(builtin.id)
        if (!existing) {
          console.log('[SkillManager] Saving builtin skill:', builtin.id)
          await storage.saveSkill(builtin, '')
        } else {
          console.log('[SkillManager] Builtin skill already exists:', builtin.id)
        }
      }

      await this.refreshCache()

      // Update tool registry with skill tools
      const { getToolRegistry } = await import('@/agent/tool-registry')
      const registry = getToolRegistry()
      await registry.registerSkillTools()

      console.log(
        '[SkillManager] _doInitialize: complete, cached',
        this.cachedSkills.length,
        'skills'
      )
      this._initialized = true
    } catch (error) {
      console.error('[SkillManager] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Scan a project directory for skill files and resources.
   * Imports both skills and their associated resource files.
   */
  async scanProject(
    rootHandle: FileSystemDirectoryHandle
  ): Promise<{ added: number; resourcesAdded: number; errors: string[] }> {
    const { skills, resources, errors } = await scanProjectSkills(rootHandle)

    let added = 0
    let resourcesAdded = 0

    // Save all skills — upsert keeps project skills in sync with disk
    for (const skill of skills) {
      const existing = await storage.getSkillById(skill.id)
      await storage.saveSkill(skill, '')
      if (!existing) {
        added++
        console.log(`[SkillManager] Imported skill: ${skill.name} (${skill.id})`)
      } else {
        console.log(`[SkillManager] Updated skill: ${skill.name} (${skill.id})`)
      }
    }

    // Replace existing resources for scanned skills to keep DB in sync with disk.
    for (const skill of skills) {
      await storage.deleteSkillResources(skill.id)
    }

    // Then, save resources
    for (const resource of resources) {
      let skillId = resource.skillId
      if (!skillId || skillId === 'pending') {
        if (skills.length !== 1) {
          errors.push(
            `Unable to resolve owning skill for resource '${resource.resourcePath}' (skillId missing)`
          )
          continue
        }
        skillId = skills[0].id
      }

      const normalizedResource = {
        ...resource,
        skillId,
        id: resource.id && !resource.id.startsWith('pending:')
          ? resource.id
          : generateResourceId(skillId, resource.resourcePath),
      }

      await storage.saveSkillResource(normalizedResource)
      resourcesAdded++
      console.log(`[SkillManager] Imported resource: ${normalizedResource.resourcePath}`)
    }

    if (added > 0 || resourcesAdded > 0) {
      await this.refreshCache()
    }

    return { added, resourcesAdded, errors }
  }

  /**
   * Get the skills block for system prompt.
   * Uses the new on-demand loading approach - only metadata is injected.
   *
   * @param sessionState - Optional session state for tracking recommendations
   * @param context - The current conversation context
   * @returns The skills system block to append to the system prompt
   */
  getSkillsBlock(sessionState: SessionSkillState | undefined, context: SkillMatchContext): string {
    const metadata = this.cachedSkills.map((s) => ({
      id: s.id,
      name: s.name,
      version: s.version,
      description: s.description,
      author: s.author,
      category: s.category,
      tags: s.tags,
      source: s.source,
      triggers: s.triggers,
      enabled: s.enabled,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })) as SkillMetadata[]

    // Match skills for recommendations
    const matches = matchSkillsForRecommendation(metadata, context)

    if (sessionState) {
      return buildAvailableSkillsBlockWithRecommendations(metadata, sessionState, matches)
    }

    return buildAvailableSkillsBlock(metadata, context)
  }

  /**
   * Get the enhanced system prompt with skills block.
   * This is a synchronous method - ensure initialize() has been called first.
   *
   * @deprecated Use getSkillsBlock directly instead for more control
   */
  getEnhancedSystemPrompt(basePrompt: string, context: SkillMatchContext): string {
    const skillsBlock = this.getSkillsBlock(undefined, context)
    return basePrompt + skillsBlock
  }

  /**
   * Get all cached skills (for UI display).
   */
  getSkills(): Skill[] {
    return this.cachedSkills
  }

  /**
   * Refresh the in-memory skill cache from SQLite.
   */
  async refreshCache(): Promise<void> {
    this.cachedSkills = await storage.getAllSkills()
  }
}

/** Singleton instance */
let instance: SkillManager | null = null

export function getSkillManager(): SkillManager {
  if (!instance) {
    instance = new SkillManager()
  }
  return instance
}
