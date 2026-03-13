/**
 * Storage Module
 *
 * Unified SQLite-based storage for CreatorWeave.
 *
 * @module storage
 */

// Initialization and utilities
export {
  initStorage,
  setupAutoSave,
  getStorageStatus,
  clearAllStorage,
  exportStorage,
  importStorage,
  getStorageMode,
} from './init'

export type { InitStorageOptions, InitStorageResult, StorageStatus, StorageMode } from './init'
