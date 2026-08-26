import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Skill, SkillResource } from '../skill-types'
import { SkillManager } from '../skill-manager'
import { scanProjectSkills } from '../skill-scanner'

vi.mock('../skill-storage', () => ({
  getAllSkills: vi.fn().mockResolvedValue([]),
  getSkillResources: vi.fn().mockResolvedValue([]),
  purgeProjectSkillsFromStorage: vi.fn().mockResolvedValue(0),
}))

vi.mock('../skill-scanner', () => ({
  scanProjectSkills: vi.fn(),
}))

describe('SkillManager.scanProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  it('loads scanned project skills/resources into runtime cache only', async () => {
    const skills: Skill[] = [
      {
        id: 'project:.skills/skill-a',
        name: 'skill-a',
        version: '1.0.0',
        description: '',
        author: 'test',
        category: 'general',
        tags: [],
        source: 'project',
        triggers: { keywords: ['a'] },
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
        instruction: 'A',
      },
      {
        id: 'project:.skills/skill-b',
        name: 'skill-b',
        version: '1.0.0',
        description: '',
        author: 'test',
        category: 'general',
        tags: [],
        source: 'project',
        triggers: { keywords: ['b'] },
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
        instruction: 'B',
      },
    ]

    const resources: SkillResource[] = [
      {
        id: 'project:.skills/skill-a:references/a.md',
        skillId: 'project:.skills/skill-a',
        resourcePath: 'references/a.md',
        resourceType: 'reference',
        content: 'a',
        contentType: 'text/markdown',
        size: 1,
        createdAt: 1,
      },
      {
        id: 'project:.skills/skill-b:scripts/b.sh',
        skillId: 'project:.skills/skill-b',
        resourcePath: 'scripts/b.sh',
        resourceType: 'script',
        content: 'b',
        contentType: 'text/x-shellscript',
        size: 1,
        createdAt: 1,
      },
    ]

    vi.mocked(scanProjectSkills).mockResolvedValue({
      skills,
      resources,
      errors: [],
    })

    const manager = new SkillManager()
    const result = await manager.scanProject({} as FileSystemDirectoryHandle)

    expect(manager.getSkills()).toHaveLength(2)
    const runtimeResources = await manager.getSkillResources('project:.skills/skill-a')
    expect(runtimeResources).toEqual([
      expect.objectContaining({
        skillId: 'project:.skills/skill-a',
        resourcePath: 'references/a.md',
      }),
    ])
    expect(result).toEqual({
      added: 2,
      resourcesAdded: 2,
      errors: [],
    })
  })

  it('replaces project cache and tracks newly added skills', async () => {
    const manager = new SkillManager()

    vi.mocked(scanProjectSkills).mockResolvedValueOnce({
      skills: [
        {
          id: 'project:.skills/alpha',
          name: 'alpha',
          version: '1.0.0',
          description: '',
          author: 'test',
          category: 'general',
          tags: [],
          source: 'project',
          triggers: { keywords: [] },
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
          instruction: 'alpha',
        },
      ],
      resources: [],
      errors: [],
    })
    await manager.scanProject({} as FileSystemDirectoryHandle)

    vi.mocked(scanProjectSkills).mockResolvedValueOnce({
      skills: [
        {
          id: 'project:.skills/alpha',
          name: 'alpha',
          version: '1.0.0',
          description: '',
          author: 'test',
          category: 'general',
          tags: [],
          source: 'project',
          triggers: { keywords: [] },
          enabled: true,
          createdAt: 1,
          updatedAt: 2,
          instruction: 'alpha2',
        },
        {
          id: 'project:.skills/beta',
          name: 'beta',
          version: '1.0.0',
          description: '',
          author: 'test',
          category: 'general',
          tags: [],
          source: 'project',
          triggers: { keywords: [] },
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
          instruction: 'beta',
        },
      ],
      resources: [],
      errors: [],
    })

    const result = await manager.scanProject({} as FileSystemDirectoryHandle)
    expect(result.added).toBe(1)
    expect(manager.getSkills().map((s) => s.id).sort()).toEqual([
      'project:.skills/alpha',
      'project:.skills/beta',
    ])
  })

  it('persists project skill enabled state across rescans', async () => {
    const manager = new SkillManager()

    vi.mocked(scanProjectSkills).mockResolvedValue({
      skills: [
        {
          id: 'project:.skills/local-toggle',
          name: 'local-toggle',
          version: '1.0.0',
          description: '',
          author: 'test',
          category: 'general',
          tags: [],
          source: 'project',
          triggers: { keywords: [] },
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
          instruction: 'toggle me',
        },
      ],
      resources: [],
      errors: [],
    })

    await manager.scanProject({} as FileSystemDirectoryHandle, 'proj-1')
    manager.setProjectSkillEnabled('project:.skills/local-toggle', false, 'proj-1')

    await manager.scanProject({} as FileSystemDirectoryHandle, 'proj-1')
    expect(manager.getSkillById('project:.skills/local-toggle')?.enabled).toBe(false)
  })
})
