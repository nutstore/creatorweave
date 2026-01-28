import { describe, it, expect, vi } from 'vitest'
import { traverseDirectory } from './traversal.service'

describe('traversal.service', () => {
  it('should yield file metadata for each file', async () => {
    const mockFileHandle = {
      name: 'test.txt',
      kind: 'file',
      getFile: vi.fn().mockResolvedValue({
        name: 'test.txt',
        size: 1024,
        lastModified: 1234567890,
      }),
    }

    const mockDirHandle = {
      name: 'test-folder',
      kind: 'directory',
      entries: vi.fn().mockResolvedValue([['test.txt', mockFileHandle]]),
    }

    const results: any[] = []
    for await (const result of traverseDirectory(mockDirHandle as any)) {
      results.push(result)
    }

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      name: 'test.txt',
      size: 1024,
      type: 'file',
      lastModified: 1234567890,
      path: 'test.txt',
    })
  })

  it('should handle subdirectories recursively', async () => {
    const mockNestedFile = {
      name: 'nested.txt',
      kind: 'file',
      getFile: vi.fn().mockResolvedValue({
        name: 'nested.txt',
        size: 2048,
        lastModified: 1234567890,
      }),
    }

    const mockSubDir = {
      name: 'subfolder',
      kind: 'directory',
      entries: vi.fn().mockResolvedValue([['nested.txt', mockNestedFile]]),
    }

    const mockFileHandle = {
      name: 'test.txt',
      kind: 'file',
      getFile: vi.fn().mockResolvedValue({
        name: 'test.txt',
        size: 1024,
        lastModified: 1234567890,
      }),
    }

    const mockDirHandle = {
      name: 'test-folder',
      kind: 'directory',
      entries: vi.fn().mockResolvedValue([
        ['test.txt', mockFileHandle],
        ['subfolder', mockSubDir],
      ]),
    }

    const results: any[] = []
    for await (const result of traverseDirectory(mockDirHandle as any)) {
      results.push(result)
    }

    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('test.txt')
    expect(results[1].name).toBe('nested.txt')
    expect(results[1].path).toBe('subfolder/nested.txt')
  })

  it('should skip files that cannot be accessed', async () => {
    const mockErrorFile = {
      name: 'error.txt',
      kind: 'file',
      getFile: vi.fn().mockRejectedValue(new Error('Access denied')),
    }

    const mockDirHandle = {
      name: 'test-folder',
      kind: 'directory',
      entries: vi.fn().mockResolvedValue([['error.txt', mockErrorFile]]),
    }

    const results: any[] = []
    for await (const result of traverseDirectory(mockDirHandle as any)) {
      results.push(result)
    }

    expect(results).toHaveLength(0)
  })

  it('should handle empty directories', async () => {
    const mockDirHandle = {
      name: 'empty-folder',
      kind: 'directory',
      entries: vi.fn().mockResolvedValue([]),
    }

    const results: any[] = []
    for await (const result of traverseDirectory(mockDirHandle as any)) {
      results.push(result)
    }

    expect(results).toHaveLength(0)
  })
})
