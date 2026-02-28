/* eslint-disable @typescript-eslint/no-explicit-any */
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

// Set default test timeout for long-running tests
beforeEach(() => {
  vi.setConfig({ testTimeout: 30000 })
})
