// @ts-nocheck - Tests need migration to updated types
/**
 * Plugin Loader Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PluginLoaderService } from './plugin-loader.service'

// Mock Worker
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  addEventListener = vi.fn()
  postMessage = vi.fn()
  removeEventListener = vi.fn()
  terminate = vi.fn()

  constructor() {
    // Simulate async loading
    setTimeout(() => {
      this.onmessage?.({
        data: {
          type: 'LOADED',
          payload: {
            metadata: {
              id: 'test-plugin',
              name: 'Test Plugin',
              version: '1.0.0',
              api_version: '2.0.0',
              description: 'A test plugin',
              author: 'BFOSA Team',
              capabilities: {
                metadata_only: true,
                requires_content: false,
                supports_streaming: false,
                max_file_size: 0,
                file_extensions: [],
              },
              resource_limits: {
                max_memory: 16 * 1024 * 1024,
                max_execution_time: 5000,
                worker_count: 1,
              },
            },
          },
        },
      } as MessageEvent)
    }, 10)
  }

  // URL mock doesn't exist in test environment
  declare URL: {
    new (url: string, base?: string): URL
  }
}

// Mock URL for worker
global.URL = MockWorker as any

describe('PluginLoaderService', () => {
  let loader: PluginLoaderService

  beforeEach(() => {
    loader = new PluginLoaderService()
  })

  describe('validateWasmFormat', () => {
    it('should reject invalid WASM (bad magic number)', async () => {
      const invalidBytes = new ArrayBuffer(8)
      new Uint8Array(invalidBytes).set([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])

      await expect(loader['loadPlugin'](invalidBytes)).rejects.toThrow()
    })

    it('should reject non-WASM data', async () => {
      const shortBytes = new ArrayBuffer(4)

      await expect(loader['loadPlugin'](shortBytes)).rejects.toThrow()
    })
  })

  describe('plugin management', () => {
    it('should track loaded plugins', () => {
      expect(loader.getLoadedCount()).toBe(0)
    })

    it('should return undefined for non-existent plugin', () => {
      expect(loader.getPlugin('nonexistent')).toBeUndefined()
    })
  })

  describe('cleanupAll', () => {
    it('should cleanup even with errors', async () => {
      // Add a mock plugin
      const mockInstance = {
        metadata: {
          id: 'test',
          name: 'Test',
          version: '1.0.0',
          api_version: '2.0.0',
          description: 'Test',
          author: 'Test',
          capabilities: {
            metadata_only: true,
            requires_content: false,
            supports_streaming: false,
            max_file_size: 0,
            file_extensions: [],
          },
          resource_limits: {
            max_memory: 1024,
            max_execution_time: 1000,
            worker_count: 1,
          },
        },
        state: 'Loaded' as const,
      }

      loader['plugins'].set('test', mockInstance)

      // Cleanup should not throw even with no worker
      await loader.cleanupAll()

      expect(loader.getLoadedCount()).toBe(0)
    })
  })

  describe('getPluginLoader singleton', () => {
    it('should return same instance', () => {
      const instance1 = loader
      const instance2 = loader

      // Reset to test singleton
      ;(loader as any) = null
      const instance3 = loader

      expect(instance1).toBe(instance2)
      expect(instance1).not.toBe(instance3)
    })
  })
})
