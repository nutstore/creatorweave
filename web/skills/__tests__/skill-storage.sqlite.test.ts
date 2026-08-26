/**
 * skill-storage.sqlite.ts Unit Tests
 *
 * Tests for the SQLite-based skill storage layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StoredSkill, Skill } from '../skill-types'
import type { SkillCategory } from '../skill-types'

// Mock skills data store
let mockSkills: StoredSkill[] = []

// Mock repository instance
const createMockRepo = () => ({
  findAll: vi.fn(() => Promise.resolve([...mockSkills])),
  findById: vi.fn((id: string) => Promise.resolve(mockSkills.find((s) => s.id === id) || null)),
  findAllMetadata: vi.fn(() =>
    Promise.resolve(
      mockSkills.map(({ rawContent, instruction, examples, templates, ...rest }) => rest)
    )
  ),
  findByCategory: vi.fn((category: string) =>
    Promise.resolve(mockSkills.filter((s) => s.category === category))
  ),
  findEnabled: vi.fn(() => Promise.resolve(mockSkills.filter((s) => s.enabled))),
  search: vi.fn((keyword: string) =>
    Promise.resolve(
      mockSkills.filter(
        (s) =>
          s.name.toLowerCase().includes(keyword.toLowerCase()) ||
          s.description.toLowerCase().includes(keyword.toLowerCase())
      )
    )
  ),
  save: vi.fn(() => Promise.resolve()),
  toggleEnabled: vi.fn(() => Promise.resolve()),
  delete: vi.fn((id: string) => {
    const index = mockSkills.findIndex((s) => s.id === id)
    if (index >= 0) mockSkills.splice(index, 1)
    return Promise.resolve()
  }),
  deleteAll: vi.fn(() => {
    mockSkills.length = 0
    return Promise.resolve()
  }),
  getCategories: vi.fn(() =>
    Promise.resolve(Array.from(new Set(mockSkills.map((s) => s.category))))
  ),
  findBySource: vi.fn((source: string) =>
    Promise.resolve(mockSkills.filter((s) => s.source === source))
  ),
  deleteResourcesForSkill: vi.fn(() => Promise.resolve()),
  getEnabledSkillNames: vi.fn(() =>
    Promise.resolve(mockSkills.filter((s) => s.enabled).map((s) => s.name))
  ),
})

let mockRepoInstance = createMockRepo()

// Mock the SQLite database manager
vi.mock('@/sqlite', () => ({
  initSQLiteDB: vi.fn(() => Promise.resolve()),
  getSQLiteDB: vi.fn(() => ({
    queryAll: vi.fn(() => Promise.resolve([])),
    queryFirst: vi.fn(() => Promise.resolve(null)),
    execute: vi.fn(() => Promise.resolve()),
  })),
  getSkillRepository: vi.fn(() => mockRepoInstance),
}))

import * as skillStorage from '../skill-storage.sqlite'

// Helper function to create mock skill
function createMockSkill(overrides: Partial<StoredSkill> = {}): StoredSkill {
  const now = Date.now()
  return {
    id: 'test-skill',
    name: 'Test Skill',
    version: '1.0.0',
    description: 'Test description',
    author: 'test',
    category: 'general' as SkillCategory,
    tags: [],
    source: 'user',
    triggers: { keywords: [] },
    instruction: 'Test instructions',
    examples: undefined,
    templates: undefined,
    rawContent: '# Test Skill',
    enabled: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('skill-storage.sqlite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSkills.length = 0
    mockRepoInstance = createMockRepo()
    // Reset the module to get fresh mock
    vi.doMock('@/sqlite', () => ({
      initSQLiteDB: vi.fn(() => Promise.resolve()),
      getSkillRepository: vi.fn(() => mockRepoInstance),
    }))
  })

  describe('getAllSkills', () => {
    it('should return empty array when no skills exist', async () => {
      const result = await skillStorage.getAllSkills()
      expect(result).toEqual([])
    })

    it('should return all stored skills', async () => {
      mockSkills.push(
        createMockSkill({ id: 'skill-1', name: 'Skill 1' }),
        createMockSkill({ id: 'skill-2', name: 'Skill 2' })
      )

      const result = await skillStorage.getAllSkills()
      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('skill-1')
      expect(result[1].id).toBe('skill-2')
    })

    it('should filter out project source skills', async () => {
      mockSkills.push(
        createMockSkill({ id: 'skill-user', source: 'user' }),
        createMockSkill({ id: 'skill-project', source: 'project' })
      )

      const result = await skillStorage.getAllSkills()
      expect(result.map((s) => s.id)).toEqual(['skill-user'])
    })
  })

  describe('getAllSkillMetadata', () => {
    it('should return empty metadata when no skills exist', async () => {
      const result = await skillStorage.getAllSkillMetadata()
      expect(result).toEqual([])
    })

    it('should return metadata without raw content', async () => {
      mockSkills.push(
        createMockSkill({
          id: 'skill-1',
          name: 'Skill 1',
          instruction: 'Some instruction',
          rawContent: '# Raw Content',
        })
      )

      const result = await skillStorage.getAllSkillMetadata()
      expect(result).toHaveLength(1)
      // SkillMetadata should not have instruction or rawContent
      expect('instruction' in result[0]).toBe(false)
      expect('rawContent' in result[0]).toBe(false)
    })
  })

  describe('getSkillById', () => {
    it('should return skill when found', async () => {
      mockSkills.push(createMockSkill({ id: 'skill-1' }))

      const result = await skillStorage.getSkillById('skill-1')
      expect(result).toBeDefined()
      expect(result?.id).toBe('skill-1')
    })

    it('should return undefined when not found', async () => {
      const result = await skillStorage.getSkillById('non-existent')
      expect(result).toBeUndefined()
    })
  })

  describe('saveSkill', () => {
    it('should save a new skill', async () => {
      const skill: Skill = {
        id: 'new-skill',
        name: 'New Skill',
        description: 'New description',
        category: 'general' as SkillCategory,
        triggers: { keywords: [] },
        instruction: 'Instructions',
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.0.0',
        author: 'test',
        tags: [],
        source: 'user',
      }

      await skillStorage.saveSkill(skill, '# Markdown')

      expect(mockRepoInstance.save).toHaveBeenCalled()
    })

    it('should update existing skill', async () => {
      const skill: Skill = {
        id: 'existing-skill',
        name: 'Updated Skill',
        description: 'Updated description',
        category: 'general' as SkillCategory,
        triggers: { keywords: [] },
        instruction: 'Instructions',
        enabled: true,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
        version: '1.0.0',
        author: 'test',
        tags: [],
        source: 'user',
      }

      await skillStorage.saveSkill(skill, '# Markdown')

      expect(mockRepoInstance.save).toHaveBeenCalled()
    })

    it('should not persist project source skills', async () => {
      const projectSkill: Skill = {
        id: 'project:.skills/local-skill',
        name: 'Local Skill',
        description: 'Project scoped',
        category: 'general' as SkillCategory,
        triggers: { keywords: [] },
        instruction: 'Instructions',
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        version: '1.0.0',
        author: 'test',
        tags: [],
        source: 'project',
      }

      await skillStorage.saveSkill(projectSkill, '# Markdown')
      expect(mockRepoInstance.save).not.toHaveBeenCalled()
    })
  })

  describe('deleteSkill', () => {
    it('should delete a skill by id', async () => {
      mockSkills.push(createMockSkill({ id: 'skill-1' }))

      await skillStorage.deleteSkill('skill-1')

      expect(mockRepoInstance.delete).toHaveBeenCalledWith('skill-1')
    })
  })

  describe('toggleSkill', () => {
    it('should enable a disabled skill', async () => {
      await skillStorage.toggleSkill('skill-1', true)

      expect(mockRepoInstance.toggleEnabled).toHaveBeenCalledWith('skill-1', true)
    })

    it('should disable an enabled skill', async () => {
      await skillStorage.toggleSkill('skill-1', false)

      expect(mockRepoInstance.toggleEnabled).toHaveBeenCalledWith('skill-1', false)
    })
  })

  describe('getSkillsByCategory', () => {
    it('should return skills in specified category', async () => {
      mockSkills.push(
        createMockSkill({ id: 'skill-1', category: 'testing' as SkillCategory }),
        createMockSkill({ id: 'skill-2', category: 'debugging' as SkillCategory }),
        createMockSkill({ id: 'skill-3', category: 'testing' as SkillCategory })
      )

      const result = await skillStorage.getSkillsByCategory('testing')

      expect(result).toHaveLength(2)
      expect(result.every((s) => s.category === 'testing')).toBe(true)
    })
  })

  describe('getEnabledSkills', () => {
    it('should return only enabled skills', async () => {
      mockSkills.push(
        createMockSkill({ id: 'skill-1', enabled: true }),
        createMockSkill({ id: 'skill-2', enabled: false }),
        createMockSkill({ id: 'skill-3', enabled: true })
      )

      const result = await skillStorage.getEnabledSkills()

      expect(result).toHaveLength(2)
      expect(result.every((s) => s.enabled)).toBe(true)
    })
  })

  describe('searchSkills', () => {
    it('should search by keyword', async () => {
      mockSkills.push(
        createMockSkill({ name: 'Code Review', description: 'Review code quality' }),
        createMockSkill({ name: 'Testing', description: 'Test automation' }),
        createMockSkill({ name: 'Debug', description: 'Find bugs' })
      )

      const result = await skillStorage.searchSkills('review')

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Code Review')
    })

    it('should be case insensitive', async () => {
      mockSkills.push(createMockSkill({ name: 'Code Analysis' }))

      const result = await skillStorage.searchSkills('CODE')

      expect(result).toHaveLength(1)
    })
  })

  describe('clearAllSkills', () => {
    it('should clear all skills', async () => {
      mockSkills.push(createMockSkill({ id: 'skill-1' }), createMockSkill({ id: 'skill-2' }))

      await skillStorage.clearAllSkills()

      expect(mockRepoInstance.deleteAll).toHaveBeenCalled()
    })
  })

  describe('getSkillCategories', () => {
    it('should return unique categories', async () => {
      mockSkills.push(
        createMockSkill({ category: 'testing' as SkillCategory }),
        createMockSkill({ category: 'debugging' as SkillCategory }),
        createMockSkill({ category: 'testing' as SkillCategory })
      )

      const result = await skillStorage.getSkillCategories()

      expect(result).toHaveLength(2)
      expect(result).toContain('testing')
      expect(result).toContain('debugging')
    })
  })

  describe('purgeProjectSkillsFromStorage', () => {
    it('should delete legacy project skills and return purged count', async () => {
      mockSkills.push(
        createMockSkill({ id: 'skill-user', source: 'user' }),
        createMockSkill({ id: 'project:.skills/local-1', source: 'project' }),
        createMockSkill({ id: 'project:.skills/local-2', source: 'project' })
      )

      const count = await skillStorage.purgeProjectSkillsFromStorage()

      expect(count).toBe(2)
      expect(mockRepoInstance.deleteResourcesForSkill).toHaveBeenCalledTimes(2)
      expect(mockRepoInstance.delete).toHaveBeenCalledWith('project:.skills/local-1')
      expect(mockRepoInstance.delete).toHaveBeenCalledWith('project:.skills/local-2')
    })
  })

  describe('skillToMetadata', () => {
    it('should extract metadata from stored skill', () => {
      const skill: StoredSkill = createMockSkill({
        id: 'skill-1',
        name: 'Test Skill',
        instruction: 'Instructions',
        rawContent: '# Raw Content',
      })

      const metadata = skillStorage.skillToMetadata(skill)

      expect(metadata.id).toBe('skill-1')
      expect(metadata.name).toBe('Test Skill')
      // skillToMetadata removes instruction and rawContent
      expect('instruction' in metadata).toBe(false)
      expect('rawContent' in metadata).toBe(false)
    })
  })
})
