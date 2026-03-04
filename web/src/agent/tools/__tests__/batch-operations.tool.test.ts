/**
 * Tests for Batch Operations Tools
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  batchEditDefinition,
  batchEditExecutor,
  fileBatchReadDefinition,
  fileBatchReadExecutor,
} from '../batch-operations.tool'
import type { ToolContext } from '../tool-types'

// Mock OPFS store
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()
const mockGetPendingChanges = vi.fn(() => [])

vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: vi.fn(() => ({
      readFile: mockReadFile,
      writeFile: mockWriteFile,
      getPendingChanges: mockGetPendingChanges,
    })),
  },
}))

// Mock remote store
vi.mock('@/store/remote.store', () => ({
  useRemoteStore: {
    getState: vi.fn(() => ({
      session: null,
    })),
  },
}))

// Mock undo manager
vi.mock('@/undo/undo-manager', () => ({
  getUndoManager: () => ({
    recordModification: vi.fn(),
  }),
}))

// Mock file system services
const mockTraverseDirectory = async function* () {
  yield { type: 'file' as const, name: 'test.ts', path: 'test.ts', size: 1000 }
  yield { type: 'file' as const, name: 'example.ts', path: 'src/example.ts', size: 1500 }
  yield { type: 'file' as const, name: 'data.json', path: 'data.json', size: 500 }
  yield { type: 'file' as const, name: 'test.txt', path: 'test.txt', size: 50 }
  yield { type: 'file' as const, name: 'data.txt', path: 'src/data.txt', size: 100 }
  yield { type: 'file' as const, name: 'large.txt', path: 'large.txt', size: 300000 }
  yield { type: 'file' as const, name: 'binary.bin', path: 'binary.bin', size: 3 }
  yield { type: 'file' as const, name: 'image.png', path: 'image.png', size: 4 }
}

vi.mock('@/services/traversal.service', () => ({
  traverseDirectory: () => mockTraverseDirectory(),
}))

vi.mock('@/services/fsAccess.service', () => ({
  resolveFileHandle: vi.fn(async (_handle: FileSystemDirectoryHandle, path: string) => {
    // Create a mock file handle
    const mockFile = {
      async getFile() {
        // Return content based on file path
        const contentMap: Record<string, string> = {
          'test.ts': 'function test() { return 42; }',
          'src/example.ts': 'interface Example { value: number; }',
          'data.json': '{"key": "value"}',
          'test.txt': 'Name: John, Age: 30\nCity: NYC',
          'src/data.txt': 'Line 1\nLine 2\nLine 3',
          'large.txt': 'x'.repeat(300000),
        }
        return {
          async text() {
            return contentMap[path] || 'default content'
          },
        } as File
      },
    }
    return mockFile as unknown as FileSystemFileHandle
  }),
}))

describe('batch_edit tool', () => {
  let mockContext: ToolContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }
    // Default mock implementations
    mockReadFile.mockResolvedValue({
      content: 'function oldName() {\n  return "hello";\n}',
      metadata: { size: 100, mtime: Date.now() },
    })
    mockWriteFile.mockResolvedValue(undefined)
  })

  describe('tool definition', () => {
    it('should have correct tool name', () => {
      expect(batchEditDefinition.function.name).toBe('batch_edit')
    })

    it('should have required parameters', () => {
      const { required } = batchEditDefinition.function.parameters
      expect(required).toContain('file_pattern')
      expect(required).toContain('find')
      expect(required).toContain('replace')
    })

    it('should have optional parameters', () => {
      const { properties } = batchEditDefinition.function.parameters
      expect(properties.dry_run).toBeDefined()
      expect(properties.use_regex).toBeDefined()
      expect(properties.max_files).toBeDefined()
    })
  })

  describe('string replacement', () => {
    it('should replace text in matching files', async () => {
      const args = {
        file_pattern: '*.ts',
        find: 'oldName',
        replace: 'newName',
        dry_run: false,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.filesMatched).toBeGreaterThan(0)
      expect(result.status).toBe('pending')
    })

    it('should preview changes when dry_run is true', async () => {
      const args = {
        file_pattern: '*.ts',
        find: 'oldName',
        replace: 'newName',
        dry_run: true,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.dryRun).toBe(true)
      expect(result.status).toBe('preview')
      expect(mockWriteFile).not.toHaveBeenCalled()
    })

    it('should handle files without matches', async () => {
      mockReadFile.mockResolvedValue({
        content: 'function somethingElse() {}',
        metadata: { size: 50, mtime: Date.now() },
      })

      const args = {
        file_pattern: '*.ts',
        find: 'oldName',
        replace: 'newName',
        dry_run: false,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.filesMatched).toBe(0)
    })
  })

  describe('regex replacement', () => {
    it('should support regex patterns', async () => {
      mockReadFile.mockResolvedValue({
        content: 'function test123() { return 456; }',
        metadata: { size: 100, mtime: Date.now() },
      })

      const args = {
        file_pattern: '*.ts',
        find: '\\d+',
        replace: 'NUMBER',
        dry_run: false,
        use_regex: true,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.totalMatches).toBeGreaterThan(0)
    })

    it('should handle invalid regex patterns', async () => {
      const args = {
        file_pattern: '*.ts',
        find: '[invalid(',
        replace: 'test',
        dry_run: false,
        use_regex: true,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('Invalid regex pattern')
    })

    it('should use capture groups in replacement', async () => {
      mockReadFile.mockResolvedValue({
        content: 'Name: John, Age: 30',
        metadata: { size: 50, mtime: Date.now() },
      })

      const args = {
        file_pattern: '*.txt',
        find: '(\\w+): (\\w+)',
        replace: '$1 = $2',
        dry_run: false,
        use_regex: true,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.totalMatches).toBeGreaterThan(0)
    })
  })

  describe('error handling', () => {
    it('should require directory handle', async () => {
      const args = {
        file_pattern: '*.ts',
        find: 'old',
        replace: 'new',
      }

      const result = JSON.parse(await batchEditExecutor(args, { directoryHandle: null }))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('No directory selected')
    })

    it('should handle file read errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('Read error'))

      const args = {
        file_pattern: '*.ts',
        find: 'old',
        replace: 'new',
        dry_run: false,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.results.some((r: any) => r.error)).toBe(true)
    })

    it('should handle binary files', async () => {
      mockReadFile.mockResolvedValue({
        content: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        metadata: { size: 4, mtime: Date.now() },
      })

      const args = {
        file_pattern: '*.png',
        find: 'old',
        replace: 'new',
        dry_run: false,
        use_regex: false,
      }

      const result = JSON.parse(await batchEditExecutor(args, mockContext))

      expect(result.results.some((r: any) => r.error?.includes('binary'))).toBe(true)
    })
  })
})

describe('file_batch_read tool', () => {
  let mockContext: ToolContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }
    mockReadFile.mockResolvedValue({
      content: 'file content',
      metadata: { size: 100, mtime: Date.now() },
    })
  })

  describe('tool definition', () => {
    it('should have correct tool name', () => {
      expect(fileBatchReadDefinition.function.name).toBe('file_batch_read')
    })

    it('should have required parameters', () => {
      const { required } = fileBatchReadDefinition.function.parameters
      expect(required).toContain('paths')
    })

    it('should have optional parameters', () => {
      const { properties } = fileBatchReadDefinition.function.parameters
      expect(properties.max_files).toBeDefined()
      expect(properties.max_size).toBeDefined()
    })
  })

  describe('batch reading', () => {
    it('should read multiple files', async () => {
      const args = {
        paths: ['file1.ts', 'file2.ts', 'file3.ts'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.total).toBe(3)
      expect(result.summary.successful).toBe(3)
      expect(result.results).toHaveLength(3)
    })

    it('should include file size information', async () => {
      mockReadFile.mockResolvedValue({
        content: 'test content',
        metadata: { size: 256, mtime: Date.now() },
      })

      const args = {
        paths: ['test.txt'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.results[0].size).toBe(256)
      expect(result.summary.totalBytes).toBe(256)
    })

    it('should format total size', async () => {
      mockReadFile.mockResolvedValue({
        content: 'x'.repeat(2048),
        metadata: { size: 2048, mtime: Date.now() },
      })

      const args = {
        paths: ['test.txt'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.totalSizeFormatted).toContain('KB')
    })

    it('should limit batch size', async () => {
      const args = {
        paths: ['1', '2', '3', '4', '5'],
        max_files: 3,
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.summary.total).toBeLessThanOrEqual(3)
    })

    it('should enforce file size limit', async () => {
      mockReadFile.mockResolvedValue({
        content: 'x'.repeat(300000),
        metadata: { size: 300000, mtime: Date.now() },
      })

      const args = {
        paths: ['large.txt'],
        max_size: 100000,
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.summary.errors).toBe(1)
      expect(result.results[0].error).toContain('exceeds limit')
    })
  })

  describe('error handling', () => {
    it('should require directory handle', async () => {
      const args = {
        paths: ['test.txt'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, { directoryHandle: null }))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('No directory selected')
    })

    it('should require non-empty paths array', async () => {
      const args = {
        paths: [],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.error).toBeDefined()
      expect(result.error).toContain('non-empty array')
    })

    it('should handle read errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'))

      const args = {
        paths: ['missing.txt'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.summary.errors).toBe(1)
      expect(result.results[0].error).toBeDefined()
    })

    it('should handle binary files', async () => {
      mockReadFile.mockResolvedValue({
        content: new Uint8Array([0x00, 0x01, 0x02]),
        metadata: { size: 3, mtime: Date.now() },
      })

      const args = {
        paths: ['binary.bin'],
      }

      const result = JSON.parse(await fileBatchReadExecutor(args, mockContext))

      expect(result.summary.errors).toBe(1)
      expect(result.results[0].error).toContain('binary')
    })
  })
})

describe('tool integration', () => {
  it('should handle concurrent operations', async () => {
    const mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }

    mockReadFile.mockResolvedValue({
      content: 'test content',
      metadata: { size: 100, mtime: Date.now() },
    })

    const batchEditPromise = batchEditExecutor(
      {
        file_pattern: '*.ts',
        find: 'old',
        replace: 'new',
        dry_run: true,
        use_regex: false,
      },
      mockContext
    )

    const batchReadPromise = fileBatchReadExecutor(
      {
        paths: ['test.ts'],
      },
      mockContext
    )

    const [editResult, readResult] = await Promise.all([batchEditPromise, batchReadPromise])

    expect(JSON.parse(editResult).success).toBe(true)
    expect(JSON.parse(readResult).success).toBe(true)
  })

  it('should provide consistent error messages', async () => {
    const noHandleContext = { directoryHandle: null }

    const tools = [
      { executor: batchEditExecutor, args: { file_pattern: '*.ts', find: 'x', replace: 'y' } },
      { executor: fileBatchReadExecutor, args: { paths: ['test.txt'] } },
    ]

    for (const tool of tools) {
      const result = JSON.parse(await tool.executor(tool.args, noHandleContext))
      expect(result.error).toBeDefined()
      expect(result.error).toContain('No directory selected')
    }
  })
})
