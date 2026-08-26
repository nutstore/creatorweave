/**
 * OPFS Storage Utilities
 *
 * Functions for estimating and managing OPFS storage usage.
 */

/** Storage estimate from navigator.storage */
export interface StorageEstimate {
  /** Used storage in bytes */
  usage: number
  /** Total quota in bytes */
  quota: number
  /** Usage percentage (0-100) */
  usagePercent: number
}

/** Storage status based on usage percentage */
export type StorageStatus = 'ok' | 'warning' | 'urgent' | 'critical'

/** Storage thresholds */
const STORAGE_THRESHOLDS = {
  WARNING: 0.7, // 70%
  URGENT: 0.8, // 80%
  CRITICAL: 0.95, // 95%
} as const

/**
 * Get storage estimate from navigator.storage
 */
export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return null
  }

  try {
    const estimate = await navigator.storage.estimate()
    const usage = estimate.usage || 0
    const quota = estimate.quota || 0

    return {
      usage,
      quota,
      usagePercent: quota > 0 ? (usage / quota) * 100 : 0,
    }
  } catch {
    return null
  }
}

/**
 * Get storage status based on usage percentage
 */
export function getStorageStatus(usagePercent: number): StorageStatus {
  if (usagePercent >= STORAGE_THRESHOLDS.CRITICAL * 100) return 'critical'
  if (usagePercent >= STORAGE_THRESHOLDS.URGENT * 100) return 'urgent'
  if (usagePercent >= STORAGE_THRESHOLDS.WARNING * 100) return 'warning'
  return 'ok'
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / Math.pow(k, i)

  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Calculate total size of all files in a directory
 */
export async function getDirectorySize(dirHandle: FileSystemDirectoryHandle): Promise<number> {
  let totalSize = 0

  try {
    for await (const [, handle] of dirHandle.entries()) {
      if (handle.kind === 'file') {
        try {
          const file = await handle.getFile()
          totalSize += file.size
        } catch {
          // File might not be accessible
        }
      } else if (handle.kind === 'directory') {
        // Recursively calculate directory size
        totalSize += await getDirectorySize(handle as FileSystemDirectoryHandle)
      }
    }
  } catch {
    // Directory might not exist or be inaccessible
  }

  return totalSize
}

/**
 * Get size of a specific workspace directory in OPFS.
 */
export async function getWorkspaceSize(workspaceDir: FileSystemDirectoryHandle): Promise<number> {
  return getDirectorySize(workspaceDir)
}
