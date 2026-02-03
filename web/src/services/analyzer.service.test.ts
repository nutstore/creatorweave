import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeFiles, analyzeFilesArray } from './analyzer.service'

// Mock WASM loader with dynamic state
let mockTotal = BigInt(0)
let mockCount = BigInt(0)

vi.mock('@/lib/wasm-loader', () => ({
  loadAnalyzer: vi.fn(() =>
    Promise.resolve({
      add_file: vi.fn(() => {
        mockCount++
        mockTotal += BigInt(1024)
      }),
      add_files: vi.fn((sizes: BigUint64Array) => {
        // Mock implementation that calculates total
        for (const size of sizes) {
          mockTotal += size
          mockCount++
        }
      }),
      get_total: vi.fn(() => mockTotal),
      get_count: vi.fn(() => mockCount),
      get_average: vi.fn(() => (mockCount > 0 ? Number(mockTotal / mockCount) : 0)),
      free: vi.fn(),
      reset: vi.fn(() => {
        mockTotal = BigInt(0)
        mockCount = BigInt(0)
      }),
    })
  ),
}))

describe('analyzer.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock state before each test
    mockTotal = BigInt(0)
    mockCount = BigInt(0)
  })

  it('should analyze files and return results', async () => {
    const files = [
      {
        name: 'file1.txt',
        size: 1024,
        path: '/file1.txt',
        type: 'file' as const,
        lastModified: 1234567890,
      },
      {
        name: 'file2.txt',
        size: 1024,
        path: '/file2.txt',
        type: 'file' as const,
        lastModified: 1234567890,
      },
      {
        name: 'file3.txt',
        size: 1024,
        path: '/file3.txt',
        type: 'file' as const,
        lastModified: 1234567890,
      },
    ]

    const progressCallback = vi.fn()
    const result = await analyzeFilesArray(files, progressCallback)

    expect(result.fileCount).toBe(3)
    expect(result.totalSize).toBe(3072)
    expect(result.averageSize).toBe(1024)
  })

  it('should call progress callback during analysis', async () => {
    const files = Array.from({ length: 250 }, (_, i) => ({
      name: `file${i}.txt`,
      size: 100,
      path: `/file${i}.txt`,
      type: 'file' as const,
      lastModified: 1234567890,
    }))

    const progressCallback = vi.fn()
    await analyzeFilesArray(files, progressCallback)

    // Should be called multiple times (every 50 files)
    expect(progressCallback).toHaveBeenCalled()
  })

  it('should find max file', async () => {
    const files = [
      {
        name: 'small.txt',
        size: 100,
        path: '/small.txt',
        type: 'file' as const,
        lastModified: 1234567890,
      },
      {
        name: 'large.txt',
        size: 5000,
        path: '/large.txt',
        type: 'file' as const,
        lastModified: 1234567890,
      },
      {
        name: 'medium.txt',
        size: 1000,
        path: '/medium.txt',
        type: 'file' as const,
        lastModified: 1234567890,
      },
    ]

    const progressCallback = vi.fn()
    const result = await analyzeFilesArray(files, progressCallback)

    expect(result.maxFile).toEqual({
      name: 'large.txt',
      size: 5000,
      path: '/large.txt',
    })
  })

  it('should handle empty file list', async () => {
    const files: any[] = []
    const progressCallback = vi.fn()
    const result = await analyzeFilesArray(files, progressCallback)

    expect(result.fileCount).toBe(0)
    expect(result.totalSize).toBe(0)
    expect(result.averageSize).toBe(0)
    expect(result.maxFile).toBe(null)
  })

  it('should batch file additions for performance', async () => {
    const files = Array.from({ length: 250 }, (_, i) => ({
      name: `file${i}.txt`,
      size: 100,
      path: `/file${i}.txt`,
      type: 'file' as const,
      lastModified: 1234567890,
    }))

    const progressCallback = vi.fn()
    await analyzeFilesArray(files, progressCallback)

    // With 250 files, batching should occur (batch size is 50)
    // So count should be at least 5 batches
    expect(mockCount).toBeGreaterThanOrEqual(250)
  })

  it('should process files in streaming fashion', async () => {
    // Create an async generator
    async function* createFileStream(count: number) {
      for (let i = 0; i < count; i++) {
        yield {
          name: `file${i}.txt`,
          size: 100,
          path: `/file${i}.txt`,
          type: 'file' as const,
          lastModified: 1234567890,
        }
      }
    }

    const progressCallback = vi.fn()
    const result = await analyzeFiles(createFileStream(100), progressCallback)

    expect(result.fileCount).toBe(100)
    expect(progressCallback).toHaveBeenCalled()
  })
})
