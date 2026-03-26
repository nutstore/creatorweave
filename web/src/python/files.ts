/**
 * Python File Operations - Utility functions for file handling
 *
 * Provides file operations for bridging browser files to Pyodide's virtual filesystem:
 * - Reading files from File System API handles and OPFS
 * - Validating file sizes and content types
 * - Injecting files into Pyodide filesystem
 * - Reading files back from Pyodide
 *
 * Architecture:
 * - Browser Files (File System API / OPFS) → FileRef → Pyodide FS
 */

import type { FileRef, PyodideInstance } from './types'
import { MAX_FILE_SIZE, MOUNT_POINT } from './constants'

//=============================================================================
// File Reading Functions
//=============================================================================

/**
 * Read file from File System API handle
 *
 * @param handle - FileSystemFileHandle from File System Access API
 * @returns File content as string
 * @throws Error if file cannot be read
 */
export async function readFileFromHandle(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile()
  return file.text()
}

/**
 * Read file from OPFS using workspace runtime
 *
 * @param path - File path relative to project root
 * @returns File content as string or ArrayBuffer
 * @throws Error if file cannot be read
 */
export async function readFileFromOPFS(path: string): Promise<string | ArrayBuffer> {
  const { getActiveWorkspace } = await import('@/store/workspace.store')

  const activeWorkspace = await getActiveWorkspace()
  if (!activeWorkspace) {
    throw new Error('No active workspace')
  }
  const { workspace } = activeWorkspace

  // Get directory handle from agent store
  const { useAgentStore } = await import('@/store/agent.store')
  const directoryHandle = useAgentStore.getState().directoryHandle
  if (!directoryHandle) {
    throw new Error('No directory handle available')
  }

  // Read file through OPFS cache
  const { content } = await workspace.readFile(path, directoryHandle)

  // Convert Blob content to ArrayBuffer if needed
  if (content instanceof Blob) {
    return await content.arrayBuffer()
  }

  return content
}

/**
 * Validate file size against maximum allowed size
 *
 * @param file - FileRef to validate
 * @throws Error if file exceeds maximum size
 */
export function validateFileSize(file: FileRef): void {
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2)
    const maxMB = (MAX_FILE_SIZE / 1024 / 1024).toFixed(0)
    throw new Error(
      `File ${file.path} is too large (${sizeMB}MB). Maximum allowed size is ${maxMB}MB.`
    )
  }
}

//=============================================================================
// Pyodide File System Operations
//=============================================================================

/**
 * Inject a file into Pyodide's virtual filesystem
 * This is called from the Worker thread and writes directly to Pyodide FS
 *
 * @param pyodide - Pyodide instance
 * @param file - FileRef to inject
 * @throws Error if injection fails
 */
export function injectFile(pyodide: PyodideInstance, file: FileRef): void {
  try {
    // Validate file size
    validateFileSize(file)

    // Build target path in Pyodide FS
    const targetPath = `${MOUNT_POINT}/${file.path}`

    // Create directory structure if needed
    const dirPath = targetPath.substring(0, targetPath.lastIndexOf('/'))
    if (dirPath && !pyodide.FS.exists(dirPath)) {
      pyodide.FS.mkdir(dirPath)
    }

    // Convert content to appropriate format
    let data: string | Uint8Array
    if (file.contentType === 'binary') {
      // Handle binary content
      if (typeof file.content === 'string') {
        // Assume base64 encoded binary
        const binaryString = atob(file.content)
        data = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          data[i] = binaryString.charCodeAt(i)
        }
      } else if (file.content instanceof ArrayBuffer) {
        data = new Uint8Array(file.content)
      } else {
        // Already Uint8Array
        data = file.content
      }
    } else {
      // Text content
      data = file.content as string
    }

    // Write to Pyodide FS
    pyodide.FS.writeFile(targetPath, data)

    console.log(`[Python Files] Injected file: ${targetPath} (${file.size} bytes)`)
  } catch (error) {
    console.error(`[Python Files] Failed to inject file ${file.path}:`, error)
    throw new Error(
      `Failed to inject file ${file.path}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Read a file from Pyodide's virtual filesystem
 *
 * @param pyodide - Pyodide instance
 * @param filename - File path relative to mount point
 * @returns File content as string or Uint8Array
 * @throws Error if file cannot be read
 */
export function readFileFromPyodide(pyodide: PyodideInstance, filename: string): string {
  try {
    const fullPath = filename.startsWith(MOUNT_POINT) ? filename : `${MOUNT_POINT}/${filename}`

    if (!pyodide.FS.exists(fullPath)) {
      throw new Error(`File not found: ${filename}`)
    }

    // Try to read as text first
    const data = pyodide.FS.readFile(fullPath, 'utf8') as string
    return data
  } catch (error) {
    console.error(`[Python Files] Failed to read file ${filename}:`, error)
    throw new Error(
      `Failed to read file ${filename}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * List all files in Pyodide's /mnt directory
 *
 * @param pyodide - Pyodide instance
 * @returns Array of file paths relative to mount point
 */
export function listPyodideFiles(pyodide: PyodideInstance): string[] {
  try {
    if (!pyodide.FS.exists(MOUNT_POINT)) {
      return []
    }

    const files: string[] = []

    // Recursive directory walk
    const walk = (dirPath: string, basePrefix: string = '') => {
      const entries = pyodide.FS.readdir(dirPath)

      for (const entry of entries) {
        if (entry === '.' || entry === '..') continue

        const fullPath = `${dirPath}/${entry}`
        const relPath = basePrefix ? `${basePrefix}/${entry}` : entry

        try {
          const stat = pyodide.FS.stat(fullPath)
          if (stat.mode & 0o40000) {
            // Directory
            walk(fullPath, relPath)
          } else {
            // File
            files.push(relPath)
          }
        } catch {
          // Skip entries that cannot be accessed
          continue
        }
      }
    }

    walk(MOUNT_POINT)
    return files
  } catch (error) {
    console.error('[Python Files] Failed to list Pyodide files:', error)
    return []
  }
}

/**
 * Convert a browser File object to FileRef
 *
 * @param file - File object from File API
 * @param basePath - Base path for the file (default: root)
 * @returns FileRef representation
 */
export async function fileToFileRef(file: File, basePath: string = ''): Promise<FileRef> {
  const content = await file.text()
  const path = basePath ? `${basePath}/${file.name}` : file.name

  return {
    path,
    name: file.name,
    content,
    contentType: 'text',
    size: file.size,
    source: 'filesystem',
  }
}

/**
 * Read file content as binary
 *
 * @param file - File object from File API
 * @returns Uint8Array of file content
 */
export async function readFileAsBinary(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer()
  return new Uint8Array(buffer)
}

/**
 * Check if a file is text-based on extension
 *
 * @param filename - File name to check
 * @returns true if file is likely text
 */
export function isTextFile(filename: string): boolean {
  const textExtensions = new Set([
    '.txt',
    '.md',
    '.py',
    '.js',
    '.ts',
    '.json',
    '.xml',
    '.html',
    '.css',
    '.yaml',
    '.yml',
    '.csv',
  ])

  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()
  return textExtensions.has(ext)
}
