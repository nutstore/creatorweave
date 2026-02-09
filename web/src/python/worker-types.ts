/**
 * Type definitions for Pyodide Worker
 *
 * The worker.ts is a classic worker (not a module) to support importScripts(),
 * so types are defined here for TypeScript imports.
 */

/**
 * Simple file reference for worker message passing
 * Note: For full file metadata, use types.FileRef instead
 */
export interface FileRef {
  name: string
  content: ArrayBuffer
}

export interface FileOutput {
  name: string
  content: ArrayBuffer
}

export interface ImageOutput {
  filename: string
  data: string // base64
}

export type WorkerMessage = ExecuteRequest | MountRequest | SyncRequest

export interface ExecuteRequest {
  id: string
  type: 'execute'
  code: string
  files?: FileRef[]
  /** @deprecated Packages are auto-loaded from imports. This field is kept for backward compatibility. */
  packages?: string[]
  timeout?: number
  /** Directory handle to mount at /mnt (File System Access API) */
  mountDir?: FileSystemDirectoryHandle
  /** Whether to sync changes back to native filesystem after execution */
  syncFs?: boolean
}

export interface ExecuteResult {
  success: boolean
  result?: unknown
  stdout?: string
  stderr?: string
  images?: ImageOutput[]
  outputFiles?: FileOutput[]
  executionTime: number
  error?: string
}

export interface WorkerResponse {
  id: string
  success: boolean
  result: ExecuteResult
}

/**
 * Mount request type - for mounting a directory to /mnt
 */
export interface MountRequest {
  id: string
  type: 'mount'
  dirHandle: FileSystemDirectoryHandle
}

/**
 * Mount result type
 */
export interface MountResult {
  success: boolean
  error?: string
}

/**
 * Sync request type - for syncing changes back to the native filesystem
 */
export interface SyncRequest {
  id: string
  type: 'sync'
}

/**
 * Sync result type
 */
export interface SyncResult {
  success: boolean
  error?: string
}
