import { describe, expect, it } from 'vitest'
import { scanProjectSkills } from '../skill-scanner'

interface VirtualTree {
  [name: string]: string | VirtualTree
}

function createFileHandle(name: string, content: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () => new File([content], name),
  } as unknown as FileSystemFileHandle
}

function createDirectoryHandle(name: string, tree: VirtualTree): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async getDirectoryHandle(childName: string) {
      const child = tree[childName]
      if (!child || typeof child === 'string') {
        throw new Error(`Directory not found: ${childName}`)
      }
      return createDirectoryHandle(childName, child)
    },
    async *entries() {
      for (const [childName, child] of Object.entries(tree)) {
        if (typeof child === 'string') {
          yield [childName, createFileHandle(childName, child)] as [string, FileSystemHandle]
        } else {
          yield [childName, createDirectoryHandle(childName, child)] as [string, FileSystemHandle]
        }
      }
    },
  } as unknown as FileSystemDirectoryHandle
}

describe('skill-scanner', () => {
  it('scans and stores all files under skill directory (excluding SKILL.md)', async () => {
    const root = createDirectoryHandle('root', {
      '.skills': {
        'word-editor': {
          'SKILL.md': `---
name: word-editor
category: general
triggers:
  keywords: [word]
---
# Instruction
Use word editor skill.`,
          references: {
            'api.md': '# API',
            deep: {
              'guide.md': '# Guide',
            },
          },
          scripts: {
            'build.sh': 'echo build',
          },
          templates: {
            'prompt.txt': 'template',
          },
          nested: {
            'notes.txt': 'notes',
          },
        },
      },
    })

    const result = await scanProjectSkills(root)

    expect(result.errors).toEqual([])
    expect(result.skills).toHaveLength(1)
    expect(result.skills[0].id).toBe('project:.skills/word-editor')

    const resourcePaths = result.resources.map((r) => r.resourcePath).sort()
    expect(resourcePaths).toEqual(
      [
        'nested/notes.txt',
        'references/api.md',
        'references/deep/guide.md',
        'scripts/build.sh',
        'templates/prompt.txt',
      ].sort()
    )

    for (const resource of result.resources) {
      expect(resource.skillId).toBe('project:.skills/word-editor')
      expect(resource.id).toBe(`${resource.skillId}:${resource.resourcePath}`)
    }
  })
})
