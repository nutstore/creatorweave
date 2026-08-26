/**
 * Plugin Stream Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PluginStreamService } from './plugin-stream.service'

// Mock dependencies
vi.mock('./plugin-loader.service', () => ({
  getPluginLoader: () => ({
    getPlugin: vi.fn((id) => ({
      metadata: {
        id,
        capabilities: { supports_streaming: true },
        resource_limits: { max_memory: 16 * 1024 * 1024 },
      },
    })),
    executePlugin: vi.fn(async () => ({
      path: 'test.txt',
      status: 'Success',
      data: { result: 'processed' },
    })),
    finalizePlugin: vi.fn(async () => ({
      filesProcessed: 2,
      filesSkipped: 0,
      filesWithErrors: 0,
      summary: 'Streamed 2 chunks',
      metadata: { name: 'Test', version: '1.0' },
      metrics: {},
    })),
  }),
}))

vi.mock('./stream-reader.service', () => ({
  getStreamReader: () => ({
    readStream: async function* (file: File) {
      const chunkSize = 64
      const chunks = Math.ceil(file.size / chunkSize)
      for (let i = 0; i < chunks; i++) {
        // Yield non-last chunks first
        if (i < chunks - 1) {
          yield { index: i, data: 'chunk', offset: i * chunkSize, bytes: chunkSize, isLast: false }
        }
      }
      // Yield last chunk at the end
      yield {
        index: chunks - 1,
        data: 'chunk',
        offset: (chunks - 1) * chunkSize,
        bytes: file.size % chunkSize || chunkSize,
        isLast: true,
      }
    },
    getOptimalChunkSize: () => 64 * 1024,
    shouldStream: (fileSize: number, memoryLimit = 16 * 1024 * 1024) => {
      // Stream if file > 10% of memory limit
      return fileSize > memoryLimit * 0.1
    },
  }),
}))

describe('PluginStreamService', () => {
  let service: PluginStreamService
  let mockPlugin: any
  let mockFile: File

  beforeEach(() => {
    service = new PluginStreamService()
    mockPlugin = {
      id: 'test-plugin',
      metadata: {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        capabilities: {
          supports_streaming: true,
          metadata_only: false,
          requires_content: true,
          max_file_size: 100 * 1024 * 1024,
          file_extensions: ['*'],
        },
        resource_limits: {
          max_memory: 16 * 1024 * 1024,
          max_execution_time: 30000,
          worker_count: 1,
        },
      },
    }
    mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' })
  })

  describe('supportsStreaming', () => {
    it('should return true for plugins with streaming support', () => {
      const result = service.supportsStreaming(mockPlugin)
      expect(result).toBe(true)
    })

    it('should return false for plugins without streaming support', () => {
      mockPlugin.metadata.capabilities.supports_streaming = false
      const result = service.supportsStreaming(mockPlugin)
      expect(result).toBe(false)
    })
  })

  describe('getOptimalChunkSize', () => {
    it('should calculate chunk size based on memory limit', () => {
      const pluginInstance = {
        metadata: {
          resource_limits: { max_memory: 16 * 1024 * 1024 }, // 16MB
        },
      } as any
      const result = service.getOptimalChunkSize(1024 * 1024, pluginInstance)
      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThanOrEqual(1024 * 1024) // Max 1MB
    })

    it('should ensure minimum chunk size of 4KB', () => {
      const pluginInstance = {
        metadata: {
          resource_limits: { max_memory: 1024 }, // Very small
        },
      } as any
      const result = service.getOptimalChunkSize(100, pluginInstance)
      expect(result).toBeGreaterThanOrEqual(4 * 1024)
    })
  })

  describe('shouldStream', () => {
    it('should recommend streaming for large files', () => {
      const pluginInstance = {
        metadata: {
          resource_limits: { max_memory: 16 * 1024 * 1024 }, // 16MB
        },
      } as any
      const largeFile = 2 * 1024 * 1024 // 2MB
      const result = service.shouldStream(largeFile, pluginInstance)
      expect(result).toBe(true)
    })

    it('should not recommend streaming for small files', () => {
      const pluginInstance = {
        metadata: {
          resource_limits: { max_memory: 16 * 1024 * 1024 }, // 16MB
        },
      } as any
      const smallFile = 100 * 1024 // 100KB
      const result = service.shouldStream(smallFile, pluginInstance)
      expect(result).toBe(false)
    })
  })

  describe('executeStream', () => {
    it('should process large file in chunks', async () => {
      const onProgress = vi.fn()
      const onChunk = vi.fn()

      // Create a larger file to ensure multiple chunks
      const largeContent = 'x'.repeat(200) // 200 bytes > 64 byte chunk size
      const largeFile = new File([largeContent], 'large-test.txt', { type: 'text/plain' })

      const result = await service.executeStream({
        pluginId: 'test-plugin',
        plugin: mockPlugin,
        file: largeFile,
        chunkSize: 64,
        onProgress,
        onChunk,
      })

      expect(result.chunksProcessed).toBeGreaterThan(0)
      expect(result.finalResult).toBeDefined()
      expect(onProgress).toHaveBeenCalled()
    })

    it('should respect memory limits', async () => {
      mockPlugin.metadata.resource_limits.max_memory = 1024 // 1KB limit

      // Create a file large enough to exceed memory limit
      const largeContent = 'x'.repeat(2000) // 2KB > 1KB limit
      const largeFile = new File([largeContent], 'large-test.txt', { type: 'text/plain' })

      const result = await service.executeStream({
        pluginId: 'test-plugin',
        plugin: mockPlugin,
        file: largeFile,
        chunkSize: 64,
      })

      expect(result.errors).toBeDefined()
    })

    it('should handle streaming errors gracefully', async () => {
      // Plugin that doesn't support streaming
      mockPlugin.metadata.capabilities.supports_streaming = false

      const result = await service.executeStream({
        pluginId: 'test-plugin',
        plugin: mockPlugin,
        file: mockFile,
        chunkSize: 64,
      })

      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('does not support streaming')
    })

    it('should merge stream results correctly', async () => {
      const onProgress = vi.fn()

      const result = await service.executeStream({
        pluginId: 'test-plugin',
        plugin: mockPlugin,
        file: mockFile,
        chunkSize: 64,
        onProgress,
      })

      expect(result.partialResults).toBeDefined()
      expect(Array.isArray(result.partialResults)).toBe(true)
    })
  })

  describe('progress tracking', () => {
    it('should track active streams', () => {
      expect(service.getActiveStreams()).toHaveLength(0)

      // Start a stream (executeStream is async)
      const promise = service.executeStream({
        pluginId: 'test-plugin',
        plugin: mockPlugin,
        file: mockFile,
      })

      // Check if stream is tracked
      const progress = service.getProgress('test-plugin')
      expect(progress).toBeDefined()

      return promise
    })

    it('should cancel active streams', () => {
      service.executeStream({
        pluginId: 'test-plugin',
        plugin: mockPlugin,
        file: mockFile,
      })

      const cancelled = service.cancelStream('test-plugin')
      expect(cancelled).toBe(true)
    })
  })
})
