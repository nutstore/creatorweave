/**
 * Native File System Access Module
 *
 * Provides directory handle management for native filesystem sync.
 * Supports multi-root projects with per-root handle management.
 *
 * @module native-fs
 */

import type {
  DirectoryPickerOptions,
  StoredHandle,
} from './directory-handle-manager'
import {
  DirectoryHandleManager,
  getDirectoryHandleManager,
  requestDirectoryAccess,
  getStoredDirectoryHandle,
  releaseDirectoryHandle,
  bindRuntimeDirectoryHandle,
  getRuntimeDirectoryHandle,
  getRuntimeHandlesForProject,
  unbindRuntimeDirectoryHandle,
  buildHandleKey,
  parseHandleKey,
} from './directory-handle-manager'

// Re-export types and functions
export type { DirectoryPickerOptions, StoredHandle }
export {
  DirectoryHandleManager,
  getDirectoryHandleManager,
  requestDirectoryAccess,
  getStoredDirectoryHandle,
  releaseDirectoryHandle,
  bindRuntimeDirectoryHandle,
  getRuntimeDirectoryHandle,
  getRuntimeHandlesForProject,
  unbindRuntimeDirectoryHandle,
  buildHandleKey,
  parseHandleKey,
}

/**
 * Native FS Manager Factory
 * Creates manager instances for workspace directories
 */
export function createNativeFSManager(workspaceId: string) {
  return {
    /**
     * Request directory access from user
     */
    async requestHandle(options?: DirectoryPickerOptions) {
      return await requestDirectoryAccess(workspaceId, workspaceId, options)
    },

    /**
     * Get stored directory handle
     */
    async getHandle(): Promise<StoredHandle | null> {
      return await getStoredDirectoryHandle(workspaceId, workspaceId)
    },

    /**
     * Release directory handle
     */
    async releaseHandle(): Promise<void> {
      await releaseDirectoryHandle(workspaceId, workspaceId)
    },

    /**
     * Check if handle is valid
     */
    async hasValidHandle(): Promise<boolean> {
      const manager = getDirectoryHandleManager()
      return await manager.hasValidHandle(workspaceId, workspaceId)
    },
  }
}
