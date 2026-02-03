/**
 * OPFS Utility Functions
 *
 * Path processing, hash calculation, storage management, and other utilities
 */

import type { FileContent, FileMetadata, StorageEstimate, StorageStatus } from '../types/opfs-types'
import { STORAGE_THRESHOLDS } from '../types/opfs-types'

/**
 * Encode path using URL encoding to avoid path conflicts
 * @param path Original path
 * @returns Encoded path
 */
export function encodePath(path: string): string {
  // Normalize path: use / as separator consistently
  const normalized = path.replace(/\\/g, '/')
  // URL encode
  return encodeURIComponent(normalized)
}

/**
 * Decode path
 * @param encoded Encoded path
 * @returns Original path
 */
export function decodePath(encoded: string): string {
  return decodeURIComponent(encoded)
}

/**
 * Calculate content hash for quick change comparison
 * @param content File content
 * @returns SHA-256 hash value (hex string)
 */
export async function calculateHash(content: FileContent): Promise<string> {
  const data =
    content instanceof Blob
      ? await content.arrayBuffer()
      : typeof content === 'string'
        ? new TextEncoder().encode(content)
        : content

  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Determine file type
 * @param path File path
 * @returns File type
 */
export function getFileContentType(path: string): 'text' | 'binary' {
  // Known text file extensions
  const textExtensions = new Set([
    '.js',
    '.ts',
    '.jsx',
    '.tsx',
    '.mjs',
    '.cjs',
    '.mts',
    '.cts',
    '.json',
    '.jsonc',
    '.md',
    '.mdx',
    '.txt',
    '.csv',
    '.html',
    '.htm',
    '.xml',
    '.svg',
    '.css',
    '.scss',
    '.sass',
    '.less',
    '.yml',
    '.yaml',
    '.toml',
    '.ini',
    '.conf',
    '.graphql',
    '.gql',
    '.env',
    '.env.example',
    '.lock',
    '.editorconfig',
    '.eslintrc',
    '.prettierrc',
    '.babelrc',
    '.gitignore',
    '.gitattributes',
    '.npmrc',
    '.nvmrc',
    '.dockerignore',
  ])

  const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
  return textExtensions.has(ext) ? 'text' : 'binary'
}

/**
 * Check if file is an image
 * @param path File path
 */
export function isImageFile(path: string): boolean {
  const imageExtensions = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.svg',
    '.ico',
    '.bmp',
    '.avif',
    '.heic',
    '.heif',
    '.tiff',
    '.tif',
  ])
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
  return imageExtensions.has(ext)
}

/**
 * Check if file is a PDF
 * @param path File path
 */
export function isPdfFile(path: string): boolean {
  return path.toLowerCase().endsWith('.pdf')
}

/**
 * Get storage estimate
 * @returns Storage quota and usage
 */
export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = (await navigator.storage.estimate()) as {
      quota?: number
      usage?: number
      usageDetails?: Record<string, number>
    } | null
    if (!estimate || estimate.quota === undefined || estimate.usage === undefined) {
      return null
    }
    return {
      quota: estimate.quota,
      usage: estimate.usage,
      usageDetails: estimate.usageDetails,
    }
  }
  return null
}

/**
 * Request persistent storage
 * @returns Whether persistent storage permission was granted
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if ('storage' in navigator && 'persist' in navigator.storage) {
    return await navigator.storage.persist()
  }
  return false
}

/**
 * Get storage status
 * @param estimate Storage estimate
 * @returns Storage status
 */
export function getStorageStatus(estimate: StorageEstimate | null): StorageStatus {
  if (!estimate) return 'normal'

  const ratio = estimate.usage / estimate.quota

  if (ratio >= STORAGE_THRESHOLDS.FULL) return 'full'
  if (ratio >= STORAGE_THRESHOLDS.CRITICAL) return 'critical'
  if (ratio >= STORAGE_THRESHOLDS.URGENT) return 'urgent'
  if (ratio >= STORAGE_THRESHOLDS.WARNING) return 'warning'
  return 'normal'
}

/**
 * Check if there's enough space for write
 * @param requiredSize Required space in bytes
 * @param estimate Storage estimate
 * @param safetyFactor Safety factor (default 1.5)
 */
export function hasEnoughSpace(
  requiredSize: number,
  estimate: StorageEstimate | null,
  safetyFactor: number = 1.5
): boolean {
  if (!estimate) return true

  const remaining = estimate.quota - estimate.usage
  return remaining > requiredSize * safetyFactor
}

/**
 * Estimate write size
 * @param data File content
 * @returns Estimated size in bytes
 */
export function estimateWriteSize(data: Blob | string | ArrayBuffer): number {
  const BASE_OVERHEAD = 4096 // Filesystem metadata
  const SAFETY_MULTIPLIER = 1.5 // Safety margin

  const size =
    data instanceof Blob
      ? data.size
      : typeof data === 'string'
        ? new Blob([data]).size
        : data.byteLength

  const typeMultiplier = typeof data === 'string' ? 1.2 : 1.1
  const alignedSize = Math.ceil((size * typeMultiplier + BASE_OVERHEAD) / 4096) * 4096

  return Math.ceil(alignedSize * SAFETY_MULTIPLIER)
}

/**
 * Recursively traverse directory and calculate size
 * @param dirHandle Directory handle
 * @returns Total size and file count
 */
export async function getDirectorySize(
  dirHandle: FileSystemDirectoryHandle
): Promise<{ size: number; fileCount: number }> {
  let size = 0
  let fileCount = 0

  // @ts-expect-error - values() return type is not accurate in TypeScript
  const iterator = dirHandle.values()

  for await (const entry of iterator) {
    if (entry.kind === 'file') {
      const file = await entry.getFile()
      size += file.size
      fileCount++
    } else {
      const result = await getDirectorySize(entry as FileSystemDirectoryHandle)
      size += result.size
      fileCount += result.fileCount
    }
  }

  return { size, fileCount }
}

/**
 * Format bytes to human readable format
 * @param bytes Bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`
}

/**
 * Format timestamp to relative time
 * @param timestamp Unix timestamp in milliseconds
 * @returns Relative time string (e.g., "2 minutes ago")
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`

  const date = new Date(timestamp)
  return date.toLocaleDateString()
}

/**
 * Compare if two file contents are identical
 * @param content1 File content 1
 * @param content2 File content 2
 */
export async function isContentEqual(
  content1: FileContent,
  content2: FileContent
): Promise<boolean> {
  const hash1 = await calculateHash(content1)
  const hash2 = await calculateHash(content2)
  return hash1 === hash2
}

/**
 * Read file metadata from FileHandle
 * @param fileHandle File handle
 * @param path File path
 */
export async function getFileMetadata(
  fileHandle: FileSystemFileHandle,
  path: string
): Promise<FileMetadata> {
  const file = await fileHandle.getFile()
  return {
    path,
    mtime: file.lastModified,
    size: file.size,
    contentType: getFileContentType(path),
  }
}

/**
 * Deep clone object (for immutable updates)
 */
export function deepClone<T>(obj: T): T {
  return structuredClone(obj)
}

/**
 * Generate unique ID
 * @param prefix ID prefix
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Safely parse JSON
 * @param json JSON string
 * @param defaultValue Default value
 */
export function safeJsonParse<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return defaultValue
  }
}

/**
 * Delay execution
 * @param ms Delay in milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Process array in batches
 * @param array Array
 * @param batchSize Batch size
 * @param processor Processor function
 */
export async function processBatch<T, R>(
  array: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []

  for (let i = 0; i < array.length; i += batchSize) {
    const batch = array.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(processor))
    results.push(...batchResults)
  }

  return results
}

/**
 * Get file extension
 * @param path File path
 */
export function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf('.')
  // No dot found, or dot is at the start (hidden file) - return filename as-is
  if (lastDot <= 0) {
    return path
  }
  // Has extension - return lowercase version
  const ext = path.substring(lastDot)
  return ext.toLowerCase()
}

/**
 * Get file name without extension
 * @param path File path
 */
export function getFileName(path: string): string {
  const fileName = path.substring(path.lastIndexOf('/') + 1)
  const lastDot = fileName.lastIndexOf('.')
  return lastDot > 0 ? fileName.substring(0, lastDot) : fileName
}

/**
 * Normalize path
 * @param path File path
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * Join path parts
 * @param parts Path parts
 */
export function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).map(normalizePath).join('/').replace(/\/+/g, '/')
}

/**
 * Get directory path from file path
 * @param path File path
 */
export function getDirectoryPath(path: string): string {
  const normalized = normalizePath(path)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash > 0 ? normalized.substring(0, lastSlash) : ''
}
