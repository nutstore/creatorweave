/**
 * Skills Store - Zustand store for Skills system state.
 * Using Immer middleware for simplified immutable updates.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Skill, SkillMetadata, SkillCategory } from '@/skills/skill-types'
import * as storage from '@/skills/skill-storage'
import { parseSkillMd, serializeSkillMd } from '@/skills/skill-parser'
import { getSkillManager } from '@/skills/skill-manager'

/** Refresh SkillManager cache to keep it in sync with store */
async function refreshSkillManagerCache() {
  try {
    const manager = getSkillManager()
    await manager.refreshCache()
  } catch (error) {
    console.error('[SkillsStore] Failed to refresh SkillManager cache:', error)
  }
}

interface SkillsState {
  /** All skill metadata (lightweight) */
  skills: SkillMetadata[]
  /** Whether skills have been loaded from IndexedDB */
  loaded: boolean
  /** Loading state */
  loading: boolean

  // Actions
  loadSkills: () => Promise<void>
  addSkill: (skill: Skill, rawContent?: string) => Promise<void>
  importSkillMd: (content: string) => Promise<{ success: boolean; error?: string }>
  deleteSkill: (id: string) => Promise<void>
  toggleSkill: (id: string, enabled: boolean) => Promise<void>
  getFullSkill: (id: string) => Promise<Skill | null>
  getEnabledSkills: () => Promise<Skill[]>
  getSkillsByCategory: (category: SkillCategory) => Promise<Skill[]>
}

type SkillsStateWithImmer = SkillsState & {
  setState: (partial: Partial<SkillsState> | ((state: SkillsState) => void)) => void
}

export const useSkillsStore = create<SkillsStateWithImmer>()(
  immer((set, get) => ({
    setState: set,
    skills: [],
    loaded: false,
    loading: false,

    loadSkills: async () => {
      if (get().loading) return
      set({ loading: true })
      try {
        console.log('[SkillsStore] loadSkills: starting')
        // Initialize and sync SkillManager first (this seeds builtin skills)
        const manager = getSkillManager()
        await manager.initialize()
        console.log('[SkillsStore] manager.initialize() complete')
        await refreshSkillManagerCache()

        // Now load metadata from IndexedDB (includes builtin skills)
        const metadata = await storage.getAllSkillMetadata()
        console.log('[SkillsStore] getAllSkillMetadata() returned:', metadata.length, 'skills')
        console.log(
          '[SkillsStore] Skill IDs:',
          metadata.map((s) => s.id)
        )
        set({ skills: metadata, loaded: true, loading: false })
        console.log(
          '[SkillsStore] loadSkills: complete, store now has',
          get().skills.length,
          'skills'
        )
      } catch (error) {
        console.error('[SkillsStore] loadSkills error:', error)
        set({ loading: false })
      }
    },

    addSkill: async (skill, rawContent) => {
      console.log('[SkillsStore] addSkill called:', { id: skill.id, name: skill.name })
      const raw = rawContent || serializeSkillMd(skill)
      await storage.saveSkill(skill, raw)
      // Refresh metadata list
      const metadata = await storage.getAllSkillMetadata()
      console.log(
        '[SkillsStore] Metadata after save:',
        metadata.map((s) => ({ id: s.id, name: s.name }))
      )
      set({ skills: metadata })
      await refreshSkillManagerCache()
      console.log(
        '[SkillsStore] Store skills after update:',
        get().skills.map((s) => ({ id: s.id, name: s.name }))
      )
    },

    importSkillMd: async (content) => {
      const result = parseSkillMd(content, 'import')
      if (!result.skill) {
        return { success: false, error: result.error }
      }

      // Check for duplicate ID
      const existing = await storage.getSkillById(result.skill.id)
      if (existing) {
        // Update existing skill
        result.skill.createdAt = existing.createdAt
      }

      await storage.saveSkill(result.skill, content)
      const metadata = await storage.getAllSkillMetadata()
      set({ skills: metadata })
      await refreshSkillManagerCache()
      return { success: true }
    },

    deleteSkill: async (id) => {
      await storage.deleteSkill(id)
      set((state) => {
        state.skills = state.skills.filter((s) => s.id !== id)
      })
      await refreshSkillManagerCache()
    },

    toggleSkill: async (id, enabled) => {
      await storage.toggleSkill(id, enabled)
      set((state) => {
        const skill = state.skills.find((s) => s.id === id)
        if (skill) {
          skill.enabled = enabled
        }
      })
      await refreshSkillManagerCache()
    },

    getFullSkill: async (id) => {
      const stored = await storage.getSkillById(id)
      return stored || null
    },

    getEnabledSkills: async () => {
      return storage.getEnabledSkills()
    },

    getSkillsByCategory: async (category) => {
      return storage.getSkillsByCategory(category)
    },
  }))
)
