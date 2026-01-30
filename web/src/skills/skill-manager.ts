/**
 * Skill Manager - lifecycle management and Agent integration.
 *
 * Responsibilities:
 * - Initialize skills system (load from IndexedDB + seed builtins)
 * - Scan project directory for skills
 * - Match skills to conversation context
 * - Build skill-enhanced system prompt for the Agent
 */

import type { Skill, SkillMatchContext } from './skill-types'
import * as storage from './skill-storage'
import { matchSkills, buildSkillsPrompt } from './skill-matcher'
import { scanProjectSkills } from './skill-scanner'
import { BUILTIN_SKILLS } from './builtin-skills'

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
   * Loads skills from IndexedDB and seeds builtins if needed.
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
      // Seed builtin skills if they don't exist yet
      for (const builtin of BUILTIN_SKILLS) {
        const existing = await storage.getSkillById(builtin.id)
        if (!existing) {
          await storage.saveSkill(builtin, '')
        }
      }

      await this.refreshCache()
      this._initialized = true
    } catch (error) {
      console.error('[SkillManager] Initialization failed:', error)
      throw error
    }
  }

  /**
   * Scan a project directory for skill files and import them.
   */
  async scanProject(
    rootHandle: FileSystemDirectoryHandle
  ): Promise<{ added: number; errors: string[] }> {
    const { skills, errors } = await scanProjectSkills(rootHandle)

    let added = 0
    for (const skill of skills) {
      const existing = await storage.getSkillById(skill.id)
      if (!existing) {
        await storage.saveSkill(skill, '')
        added++
      }
    }

    if (added > 0) {
      await this.refreshCache()
    }

    return { added, errors }
  }

  /**
   * Get the enhanced system prompt with matching skills injected.
   * This is a synchronous method - ensure initialize() has been called first.
   */
  getEnhancedSystemPrompt(basePrompt: string, context: SkillMatchContext): string {
    const enabledSkills = this.cachedSkills.filter((s) => s.enabled)
    const matches = matchSkills(enabledSkills, context)

    if (matches.length === 0) return basePrompt

    const skillsBlock = buildSkillsPrompt(matches)
    return basePrompt + skillsBlock
  }

  /**
   * Get all cached skills (for UI display).
   */
  getSkills(): Skill[] {
    return this.cachedSkills
  }

  /**
   * Refresh the in-memory skill cache from IndexedDB.
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
