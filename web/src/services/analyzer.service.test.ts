import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeFiles } from './analyzer.service'

// Mock WASM loader
vi.mock('@/lib/wasm-loader', () => ({
  loadAnalyzer: vi.fn(() =>
    Promise.resolve({
      add_file: vi.fn(),
      add_files: vi.fn((sizes: BigUint64Array) => {
        // Mock implementation that calculates total
        let total = BigInt(0)
        for (const size of sizes) {
          total += size
        }
      }),
      get_total: vi.fn(() => BigInt(3072)), // 3 files * 1024 bytes
      get_count: vi.fn(() => BigInt(3)),
      get_average: vi.fn(() => 1024),
      free: vi.fn(),
    })
  ),
}))

describe('analyzer.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
    const result = await analyzeFiles(files, progressCallback)

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
    await analyzeFiles(files, progressCallback)

    // Should be called multiple times (every 100 files)
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
    const result = await analyzeFiles(files, progressCallback)

    expect(result.maxFile).toEqual({
      name: 'large.txt',
      size: 5000,
      path: '/large.txt',
    })
  })

  it('should handle empty file list', async () => {
    const files: any[] = []
    const progressCallback = vi.fn()
    const result = await analyzeFiles(files, progressCallback)

    expect(result.fileCount).toBe(0)
    expect(result.totalSize).toBe(0)
    expect(result.averageSize).toBe(0)
    expect(result.maxFile).toBe(null)
  })

  it('should batch file additions for performance', async () => {
    const loadAnalyzer = await import('@/lib/wasm-loader')
    const analyzer = await loadAnalyzer.loadAnalyzer()

    const files = Array.from({ length: 250 }, (_, i) => ({
      name: `file${i}.txt`,
      size: 100,
      path: `/file${i}.txt`,
      type: 'file' as const,
      lastModified: 1234567890,
    }))

    const progressCallback = vi.fn()
    await analyzeFiles(files, progressCallback)

    // Should use add_files for batching
    expect(analyzer.add_files).toHaveBeenCalled()
  })
})
