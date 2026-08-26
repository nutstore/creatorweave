/**
 * File System Types
 *
 * Browser native File System Access API types
 */

export interface FileSystemHandlePermissionDescriptor {
  mode: FileSystemPermissionMode
}

export type FileSystemPermissionMode = 'read' | 'readwrite' | 'readwrite-with-manual-challenge'

export type PermissionState = 'granted' | 'denied' | 'prompt'

// Re-export from browser global
export type FileSystemDirectoryHandle = globalThis.FileSystemDirectoryHandle
export type FileSystemFileHandle = globalThis.FileSystemFileHandle
export type FileSystemHandle = globalThis.FileSystemHandle
