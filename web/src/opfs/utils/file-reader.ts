/**
 * File Content Reader for Diff Operations
 *
 * Provides utilities to read file contents from:
 * - OPFS (Origin Private File System)
 * - Native File System (via File System Access API)
 *
 * Used primarily for diff/compare operations between OPFS and native FS.
 */

import { getWorkspaceManager } from '../workspace'

/**
 * Read file content from OPFS cache
 * This reads directly from the cached files without checking native FS
 *
 * @param workspaceId - workspace ID
 * @param path - File path relative to workspace root
 * @returns File content as string or null if not found
 */
export async function readFileFromOPFS(
  workspaceId: string,
  path: string
): Promise<string | null> {
  try {
    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(workspaceId)

    if (!workspace) {
      console.warn(`[FileReader] Workspace ${workspaceId} not found`)
      return null
    }

    // Get the files directory in OPFS
    const filesDir = await workspace.getFilesDir()

    // Navigate to the file
    const normalizedPath = normalizePath(path)
    const fileHandle = await getFileHandleFromDir(filesDir, normalizedPath)

    if (!fileHandle) {
      // Fallback to working cache (file_write / editor pipeline may only update cache).
      const cacheContent = await workspace.readCachedFile(normalizePath(path).replace(/^\//, ''))
      if (cacheContent === null) {
        console.warn(`[FileReader] File not found in OPFS/files or cache: ${path}`)
        return null
      }

      if (typeof cacheContent === 'string') {
        return cacheContent
      }
      if (cacheContent instanceof Blob) {
        try {
          return await cacheContent.text()
        } catch {
          return null
        }
      }

      try {
        return new TextDecoder().decode(cacheContent)
      } catch {
        return null
      }
    }

    const file = await fileHandle.getFile()

    // Try to read as text
    try {
      return await file.text()
    } catch {
      // Binary file - return null for diff (we can't diff binary)
      console.warn(`[FileReader] Cannot read as text: ${path}`)
      return null
    }
  } catch (error) {
    console.error(`[FileReader] Failed to read from OPFS: ${path}`, error)
    return null
  }
}

/**
 * Read file content from native filesystem
 *
 * @param directoryHandle - Native directory handle
 * @param path - File path relative to directory
 * @returns File content as string or null if not found
 */
export async function readFileFromNativeFS(
  directoryHandle: FileSystemDirectoryHandle,
  path: string
): Promise<string | null> {
  try {
    // Navigate to the file
    const normalizedPath = normalizePath(path)
    const fileHandle = await getFileHandleFromDir(directoryHandle, normalizedPath)

    if (!fileHandle) {
      console.warn(`[FileReader] File not found in native FS: ${path}`)
      return null
    }

    const file = await fileHandle.getFile()

    // Try to read as text
    try {
      return await file.text()
    } catch {
      // Binary file
      console.warn(`[FileReader] Cannot read as text: ${path}`)
      return null
    }
  } catch (error) {
    console.error(`[FileReader] Failed to read from native FS: ${path}`, error)
    return null
  }
}

/**
 * Multi-root aware: read file from native FS by resolving the correct root handle.
 * Uses WorkspaceRuntime.resolvePath() to strip root prefix and route to the right handle.
 * Falls back to the provided directoryHandle when no workspace is available.
 */
export async function readFileFromNativeFSMultiRoot(
  directoryHandle: FileSystemDirectoryHandle | null,
  path: string
): Promise<string | null> {
  try {
    const { getWorkspaceManager } = await import('@/opfs')
    const { getProjectRepository } = await import('@/sqlite/repositories/project.repository')
    const { getRuntimeDirectoryHandle } = await import('@/native-fs')
    const manager = await getWorkspaceManager()
    const activeProject = await getProjectRepository().findActiveProject()
    if (activeProject?.id) {
      const workspace = await manager.getWorkspace(activeProject.id)
      if (workspace) {
        const resolved = await workspace.resolvePath(path)
        const rootHandle = getRuntimeDirectoryHandle(activeProject.id, resolved.rootName)
        if (rootHandle) {
          return await readFileFromNativeFS(rootHandle, resolved.relativePath)
        }
      }
    }
  } catch {
    // Fall through to directoryHandle fallback
  }
  if (directoryHandle) {
    return await readFileFromNativeFS(directoryHandle, path)
  }
  return null
}

/**
 * Read file content from OPFS with metadata
 * This version includes size and modification time
 */
export async function readFileFromOPFSWithMeta(
  workspaceId: string,
  path: string
): Promise<{ content: string | null; size: number; mtime: number } | null> {
  try {
    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(workspaceId)

    if (!workspace) {
      return null
    }

    const filesDir = await workspace.getFilesDir()
    const normalizedPath = normalizePath(path)
    const fileHandle = await getFileHandleFromDir(filesDir, normalizedPath)

    if (!fileHandle) {
      return null
    }

    const file = await fileHandle.getFile()
    let content: string | null = null

    try {
      content = await file.text()
    } catch {
      // Binary file
    }

    return {
      content,
      size: file.size,
      mtime: file.lastModified,
    }
  } catch (error) {
    console.error(`[FileReader] Failed to read from OPFS with meta: ${path}`, error)
    return null
  }
}

/**
 * Check if file exists in OPFS
 */
export async function fileExistsInOPFS(
  workspaceId: string,
  path: string
): Promise<boolean> {
  try {
    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(workspaceId)

    if (!workspace) {
      return false
    }

    const filesDir = await workspace.getFilesDir()
    const normalizedPath = normalizePath(path)
    const fileHandle = await getFileHandleFromDir(filesDir, normalizedPath)

    return fileHandle !== null
  } catch {
    return false
  }
}

/**
 * Check if file exists in native FS
 */
export async function fileExistsInNativeFS(
  directoryHandle: FileSystemDirectoryHandle,
  path: string
): Promise<boolean> {
  try {
    const normalizedPath = normalizePath(path)
    const fileHandle = await getFileHandleFromDir(directoryHandle, normalizedPath)
    return fileHandle !== null
  } catch {
    return false
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize file path - remove /mnt/ prefix if present
 */
function normalizePath(path: string): string {
  // Remove /mnt/ prefix if present
  if (path.startsWith('/mnt/')) {
    return path.substring(5)
  }
  if (path.startsWith('/mnt')) {
    return path.substring(4)
  }
  // Ensure path starts with /
  if (!path.startsWith('/')) {
    return '/' + path
  }
  return path
}

/**
 * Get file handle from directory by path
 * Creates intermediate directories as needed
 */
async function getFileHandleFromDir(
  dir: FileSystemDirectoryHandle,
  path: string
): Promise<FileSystemFileHandle | null> {
  // Remove leading slash
  const cleanPath = path.startsWith('/') ? path.substring(1) : path
  const parts = cleanPath.split('/')

  // Navigate to parent directory
  let current: FileSystemDirectoryHandle = dir
  for (let i = 0; i < parts.length - 1; i++) {
    if (!parts[i]) continue
    try {
      current = await current.getDirectoryHandle(parts[i])
    } catch {
      return null
    }
  }

  // Get file handle
  const fileName = parts[parts.length - 1]
  if (!fileName) return null

  try {
    return await current.getFileHandle(fileName)
  } catch {
    return null
  }
}

/**
 * Read binary file content as base64
 * Useful for showing binary files in diff viewer
 */
export async function readBinaryFileFromOPFS(
  workspaceId: string,
  path: string
): Promise<string | null> {
  try {
    const manager = await getWorkspaceManager()
    const workspace = await manager.getWorkspace(workspaceId)

    if (!workspace) {
      return null
    }

    const filesDir = await workspace.getFilesDir()
    const normalizedPath = normalizePath(path)
    const fileHandle = await getFileHandleFromDir(filesDir, normalizedPath)

    if (!fileHandle) {
      return null
    }

    const file = await fileHandle.getFile()
    const arrayBuffer = await file.arrayBuffer()
    const base64 = arrayBufferToBase64(arrayBuffer)

    return base64
  } catch (error) {
    console.error(`[FileReader] Failed to read binary from OPFS: ${path}`, error)
    return null
  }
}

/**
 * Read binary file from native FS as base64
 */
export async function readBinaryFileFromNativeFS(
  directoryHandle: FileSystemDirectoryHandle,
  path: string
): Promise<string | null> {
  try {
    const normalizedPath = normalizePath(path)
    const fileHandle = await getFileHandleFromDir(directoryHandle, normalizedPath)

    if (!fileHandle) {
      return null
    }

    const file = await fileHandle.getFile()
    const arrayBuffer = await file.arrayBuffer()
    const base64 = arrayBufferToBase64(arrayBuffer)

    return base64
  } catch (error) {
    console.error(`[FileReader] Failed to read binary from native FS: ${path}`, error)
    return null
  }
}

/**
 * Convert ArrayBuffer to base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
