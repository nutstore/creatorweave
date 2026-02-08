/**
 * Vitest Test Setup
 *
 * Configures the testing environment for React components and utilities.
 */

import { expect, afterEach, vi, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock IndexedDB for tests
const indexedDBMock = {
  open: vi.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: {
      createObjectStore: vi.fn(),
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
          getAll: vi.fn(),
        })),
      })),
      close: vi.fn(),
    },
  })),
}

global.indexedDB = indexedDBMock as any

// Mock File System Access API
;(globalThis as any).showDirectoryPicker = vi.fn(() => Promise.resolve({}))

// Mock URL.createObjectURL and revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

// =============================================================================
// Mock Prefetch Module - Must be before importing AgentLoop
// =============================================================================

// Create mock prefetch functions before any imports
const mockPrefetch = vi.fn(() => Promise.resolve())

vi.mock('../agent/prefetch', () => ({
  triggerPrefetch: mockPrefetch,
  createPrefetchCache: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    invalidate: vi.fn(),
    clear: vi.fn(),
  })),
  createFilePredictor: vi.fn(() => ({
    predict: vi.fn(),
    train: vi.fn(),
    clear: vi.fn(),
  })),
}))

// Set default test timeout
beforeEach(() => {
  vi.setConfig({ testTimeout: 30000 })
})
