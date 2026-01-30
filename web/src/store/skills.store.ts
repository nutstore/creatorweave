/**
 * Skills Store - Zustand store for Skills system state.
 */

import { create } from 'zustand'
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

export const useSkillsStore = create<SkillsState>()((set, get) => ({
  skills: [],
  loaded: false,
  loading: false,

  loadSkills: async () => {
    if (get().loading) return
    set({ loading: true })
    try {
      const metadata = await storage.getAllSkillMetadata()
      set({ skills: metadata, loaded: true, loading: false })
      // Initialize and sync SkillManager
      const manager = getSkillManager()
      await manager.initialize()
      await refreshSkillManagerCache()
    } catch {
      set({ loading: false })
    }
  },

  addSkill: async (skill, rawContent) => {
    const raw = rawContent || serializeSkillMd(skill)
    await storage.saveSkill(skill, raw)
    // Refresh metadata list
    const metadata = await storage.getAllSkillMetadata()
    set({ skills: metadata })
    await refreshSkillManagerCache()
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
    set((state) => ({
      skills: state.skills.filter((s) => s.id !== id),
    }))
    await refreshSkillManagerCache()
  },

  toggleSkill: async (id, enabled) => {
    await storage.toggleSkill(id, enabled)
    set((state) => ({
      skills: state.skills.map((s) => (s.id === id ? { ...s, enabled } : s)),
    }))
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
