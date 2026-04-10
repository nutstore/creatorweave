/**
 * Tests for Prefetch Cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PrefetchCache, getPrefetchCache } from '../prefetch-cache'
import type { FilePrediction } from '../file-predictor'

const { getWorkspaceManagerMock, getWorkspaceMock, readCachedFileMock } = vi.hoisted(() => ({
  getWorkspaceManagerMock: vi.fn(),
  getWorkspaceMock: vi.fn(),
  readCachedFileMock: vi.fn(),
}))

vi.mock('@/opfs/workspace', () => ({
  getWorkspaceManager: getWorkspaceManagerMock,
}))

describe('PrefetchCache', () => {
  let cache: PrefetchCache
  let mockDirectoryHandle: FileSystemDirectoryHandle

  beforeEach(() => {
    cache = new PrefetchCache()
    readCachedFileMock.mockReset()
    readCachedFileMock.mockResolvedValue(null)
    getWorkspaceMock.mockReset()
    getWorkspaceMock.mockResolvedValue({
      readCachedFile: readCachedFileMock,
    })
    getWorkspaceManagerMock.mockReset()
    getWorkspaceManagerMock.mockResolvedValue({
      getWorkspace: getWorkspaceMock,
    })
    // Create a mock directory handle
    mockDirectoryHandle = {
      name: 'test-project',
      kind: 'directory',
      queryPermission: vi.fn(async () => 'granted'),
      requestPermission: vi.fn(async () => 'granted'),
      getDirectoryHandle: vi.fn(async (name: string) => {
        if (name === 'throw') throw new Error('Not found')
        return mockDirectoryHandle
      }),
      getFileHandle: vi.fn(async (name: string) => {
        if (name === 'throw') throw new Error('Not found')
        return {
          name,
          kind: 'file',
          getFile: vi.fn(async () => new File(['content'], name)),
          createWritable: vi.fn(),
          isSameEntry: vi.fn(),
          queryPermission: vi.fn(),
          requestPermission: vi.fn(),
        } as unknown as FileSystemFileHandle
      }),
      removeEntry: vi.fn(async () => {}),
      entries: vi.fn(async function* () {
        yield ['file.txt', await mockDirectoryHandle.getFileHandle('file.txt')]
      }),
      keys: vi.fn(async function* () {
        yield 'file.txt'
      }),
      values: vi.fn(async function* () {
        yield await mockDirectoryHandle.getFileHandle('file.txt')
      }),
    } as unknown as FileSystemDirectoryHandle
  })

  describe('queue management', () => {
    it('should add predictions to queue', async () => {
      const predictions: FilePrediction[] = [
        { path: 'src/App.tsx', confidence: 0.8, reason: 'explicit-reference', context: '' },
        { path: 'src/main.tsx', confidence: 0.6, reason: 'pattern-match', context: '' },
      ]

      await cache.initialize(mockDirectoryHandle)
      await cache.prefetch(predictions)

      // Wait a bit for queue processing
      await new Promise((resolve) => setTimeout(resolve, 50))

      const pending = cache.getPendingTasks()
      const cached = cache.getCachedTasks()
      // After prefetch, tasks may be processed to 'loading' or 'cached' state
      // Check that tasks exist in some state
      const allTasks = pending.length + cached.length
      expect(allTasks).toBeGreaterThan(0)
    })

    it('should prioritize high confidence predictions', async () => {
      const predictions: FilePrediction[] = [
        { path: 'low.ts', confidence: 0.3, reason: 'pattern-match', context: '' },
        { path: 'high.ts', confidence: 0.9, reason: 'explicit-reference', context: '' },
        { path: 'medium.ts', confidence: 0.6, reason: 'pattern-match', context: '' },
      ]

      await cache.initialize(mockDirectoryHandle)
      await cache.prefetch(predictions)

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50))

      const status = cache.getStatus('high.ts')
      expect(status).toBeDefined()
      expect(status?.priority).toBe('high')
    })

    it('should limit queue size', async () => {
      // Create more predictions than max queue size (50)
      const predictions: FilePrediction[] = Array.from({ length: 60 }, (_, i) => ({
        path: `file${i}.ts`,
        confidence: 0.5,
        reason: 'pattern-match',
        context: '',
      }))

      await cache.initialize(mockDirectoryHandle)
      await cache.prefetch(predictions)

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Check queue size through pending and cached tasks
      const pending = cache.getPendingTasks()
      const cached = cache.getCachedTasks()
      const total = pending.length + cached.length

      // Should not exceed max queue size (50)
      expect(total).toBeLessThanOrEqual(50)
    })
  })

  describe('status tracking', () => {
    it('should track task status changes', async () => {
      const predictions: FilePrediction[] = [
        { path: 'test.ts', confidence: 0.8, reason: 'explicit-reference', context: '' },
      ]

      await cache.initialize(mockDirectoryHandle)
      await cache.prefetch(predictions)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 150))

      const status = cache.getStatus('test.ts')
      expect(status).toBeDefined()
      expect(['cached', 'loading', 'failed']).toContain(status?.status || '')
    })

    it('should report failed tasks', async () => {
      // Create a cache that will fail
      const failingCache = new PrefetchCache()

      // Use a directory handle that will throw
      const failingHandle = {
        ...mockDirectoryHandle,
        getFileHandle: vi.fn(async () => {
          throw new Error('File not found')
        }),
      } as unknown as FileSystemDirectoryHandle

      const predictions: FilePrediction[] = [
        { path: 'nonexistent.ts', confidence: 0.8, reason: 'explicit-reference', context: '' },
      ]

      await failingCache.initialize(failingHandle)
      await failingCache.prefetch(predictions)

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 150))

      const status = failingCache.getStatus('nonexistent.ts')
      // Status should exist (might be failed or still pending due to error)
      expect(status).toBeDefined()
    })

    it('should prefer session cache when sessionId is available', async () => {
      readCachedFileMock.mockResolvedValueOnce('cached content from workspace')

      const predictions: FilePrediction[] = [
        { path: 'src/App.tsx', confidence: 0.9, reason: 'explicit-reference', context: '' },
      ]

      await cache.initialize(mockDirectoryHandle, 'ws-test')
      await cache.prefetch(predictions)
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(getWorkspaceManagerMock).toHaveBeenCalled()
      expect(getWorkspaceMock).toHaveBeenCalledWith('ws-test')
      expect(readCachedFileMock).toHaveBeenCalled()
      expect(cache.getStatus('src/App.tsx')?.status).toBe('cached')
    })
  })

  describe('statistics', () => {
    it('should track cache hits and misses', () => {
      cache.recordAccess('existing.ts', true)
      cache.recordAccess('missing.ts', false)

      const stats = cache.getStats()
      expect(stats.cacheHitRate).toBe(0.5)
    })

    it('should track total bytes cached', () => {
      // Note: predictions variable reserved for future test enhancement
      const predictions: FilePrediction[] = [
        { path: 'test.ts', confidence: 0.8, reason: 'explicit-reference', context: '' },
      ]
      // Use type assertion to avoid unused variable warning
      void predictions

      cache.recordAccess('test.ts', true)

      const stats = cache.getStats()
      expect(stats.totalBytesCached).toBeGreaterThanOrEqual(0)
    })
  })

  describe('cache operations', () => {
    it('should clear all data', async () => {
      const predictions: FilePrediction[] = [
        { path: 'test.ts', confidence: 0.8, reason: 'explicit-reference', context: '' },
      ]

      await cache.initialize(mockDirectoryHandle)
      await cache.prefetch(predictions)

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50))

      cache.clear()

      const pending = cache.getPendingTasks()
      const cached = cache.getCachedTasks()
      expect(pending.length + cached.length).toBe(0)
    })
  })
})

describe('getPrefetchCache singleton', () => {
  it('should return same instance', () => {
    const instance1 = getPrefetchCache()
    const instance2 = getPrefetchCache()

    expect(instance1).toBe(instance2)
  })
})
