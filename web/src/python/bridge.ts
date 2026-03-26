/**
 * Python Bridge - Main bridge API for file operations
 *
 * Provides the main bridge API for transferring files between browser storage
 * and Pyodide's virtual filesystem:
 * - Get active files from browser state
 * - Bridge browser files to Pyodide
 * - Bridge Pyodide output files back to browser OPFS
 *
 * Architecture:
 * - Browser State → FileRef[] → Pyodide FS → Output Files → OPFS
 */

import type { FileRef, PyodideInstance } from './types'
import { MOUNT_POINT } from './constants'
import { injectFile, readFileFromPyodide, listPyodideFiles } from './files'
import type { FileMetadata } from '@/services/traversal.service'

//=============================================================================
// Browser File Acquisition
//=============================================================================

/**
 * Get user's active files from browser state
 *
 * This function retrieves the currently active files from the application state.
 * Files can come from:
 * - File System API handles (user-selected directory)
 * - OPFS (cached files from previous operations)
 *
 * @returns Array of FileRef objects representing active files
 * @throws Error if no directory handle is available
 */
export async function getActiveFiles(): Promise<FileRef[]> {
  // Get directory handle from agent store
  const { useAgentStore } = await import('@/store/agent.store')
  const directoryHandle = useAgentStore.getState().directoryHandle

  if (!directoryHandle) {
    throw new Error('No directory selected. Please select a project folder first.')
  }

  // Import traversal service
  const { traverseDirectory } = await import('@/services/traversal.service')

  // Get all files from the directory
  const files: FileMetadata[] = []
  for await (const file of traverseDirectory(directoryHandle)) {
    files.push(file)
  }

  // Filter to only files (not directories) and convert to FileRef
  const fileRefs: FileRef[] = []

  for (const file of files) {
    if (file.type === 'file') {
      // Read file content
      const fileHandle = await directoryHandle.getFileHandle(file.path, {
        create: false,
      })

      try {
        const fileObj = await fileHandle.getFile()
        const content = await fileObj.text()

        fileRefs.push({
          path: file.path,
          name: file.name,
          content,
          contentType: 'text',
          size: file.size,
          source: 'filesystem',
        })
      } catch (error) {
        console.warn(`[Python Bridge] Failed to read file ${file.path}:`, error)
        // Skip files that cannot be read
        continue
      }
    }
  }

  return fileRefs
}

//=============================================================================
// Browser → Pyodide Bridge
//=============================================================================

/**
 * Bridge browser files to Pyodide's virtual filesystem
 *
 * This function takes file references from the browser and injects them into
 * Pyodide's virtual filesystem at /mnt. Files are written to Pyodide FS using
 * the injectFile utility function.
 *
 * @param files - Array of FileRef objects to bridge
 * @param pyodide - Pyodide instance
 * @returns Promise that resolves when all files are injected
 * @throws Error if injection fails for any file
 */
export async function bridgeFilesToPyodide(
  files: FileRef[],
  pyodide: PyodideInstance
): Promise<void> {
  console.log(`[Python Bridge] Bridging ${files.length} files to Pyodide...`)

  // Ensure mount point exists
  if (!pyodide.FS.exists(MOUNT_POINT)) {
    pyodide.FS.mkdir(MOUNT_POINT)
    console.log(`[Python Bridge] Created mount point: ${MOUNT_POINT}`)
  }

  // Inject each file into Pyodide FS
  for (const file of files) {
    try {
      injectFile(pyodide, file)
    } catch (error) {
      console.error(`[Python Bridge] Failed to inject file ${file.path}:`, error)
      throw error
    }
  }

  console.log(`[Python Bridge] Successfully bridged ${files.length} files to Pyodide`)
}

//=============================================================================
// Pyodide → Browser OPFS Bridge
//=============================================================================

/**
 * Bridge output files from Pyodide back to browser OPFS
 *
 * This function reads files from Pyodide's /mnt directory and saves them
 * back to the browser's OPFS for persistence. This is useful for Python scripts
 * that generate output files (e.g., data processing scripts, reports).
 *
 * @param pyodide - Pyodide instance
 * @param files - Optional array of specific files to bridge (default: all files)
 * @returns Promise that resolves when all output files are saved
 * @throws Error if saving fails for any file
 */
export async function bridgeOutputFiles(pyodide: PyodideInstance, files?: string[]): Promise<void> {
  // Get list of files to bridge
  const filesToBridge = files || listPyodideFiles(pyodide)

  if (filesToBridge.length === 0) {
    console.log('[Python Bridge] No output files to bridge')
    return
  }

  console.log(`[Python Bridge] Bridging ${filesToBridge.length} output files from Pyodide...`)

  // Get active OPFS workspace
  const { getActiveWorkspace } = await import('@/store/workspace.store')
  const activeWorkspace = await getActiveWorkspace()
  if (!activeWorkspace) {
    throw new Error('No active workspace')
  }
  const { workspace } = activeWorkspace

  // Get directory handle
  const { useAgentStore } = await import('@/store/agent.store')
  const directoryHandle = useAgentStore.getState().directoryHandle
  if (!directoryHandle) {
    throw new Error('No directory handle available')
  }

  // Read each file from Pyodide and save to OPFS
  for (const filename of filesToBridge) {
    try {
      // Read file content from Pyodide
      const content = readFileFromPyodide(pyodide, filename)

      // Save to OPFS
      await workspace.writeFile(filename, content, directoryHandle)

      console.log(`[Python Bridge] Bridged output file: ${filename}`)
    } catch (error) {
      console.error(`[Python Bridge] Failed to bridge output file ${filename}:`, error)
      // Continue with other files even if one fails
      continue
    }
  }

  console.log(`[Python Bridge] Successfully bridged output files to OPFS`)
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Clear all files from Pyodide's /mnt directory
 *
 * This function removes all files and directories from the mount point.
 * Useful for cleaning up between Python executions.
 *
 * @param pyodide - Pyodide instance
 */
export function clearPyodideFiles(pyodide: PyodideInstance): void {
  if (!pyodide.FS.exists(MOUNT_POINT)) {
    return
  }

  try {
    // Recursively remove all files and directories
    const entries = pyodide.FS.readdir(MOUNT_POINT)

    for (const entry of entries) {
      if (entry === '.' || entry === '..') continue

      const fullPath = `${MOUNT_POINT}/${entry}`

      try {
        const stat = pyodide.FS.stat(fullPath)
        if (stat.mode & 0o40000) {
          // Directory - recursively remove
          pyodide.FS.rmdir(fullPath)
        } else {
          // File - remove
          pyodide.FS.unlink(fullPath)
        }
      } catch (error) {
        console.warn(`[Python Bridge] Failed to remove ${fullPath}:`, error)
      }
    }

    console.log('[Python Bridge] Cleared Pyodide /mnt directory')
  } catch (error) {
    console.error('[Python Bridge] Failed to clear Pyodide files:', error)
  }
}

/**
 * Get statistics about files in Pyodide's /mnt directory
 *
 * @param pyodide - Pyodide instance
 * @returns Object containing file count and total size
 */
export function getPyodideFileStats(pyodide: PyodideInstance): {
  count: number
  totalSize: number
} {
  const files = listPyodideFiles(pyodide)
  let totalSize = 0

  for (const file of files) {
    try {
      const fullPath = file.startsWith(MOUNT_POINT) ? file : `${MOUNT_POINT}/${file}`
      const stat = pyodide.FS.stat(fullPath)
      totalSize += stat.size
    } catch {
      // Skip files that cannot be accessed
      continue
    }
  }

  return {
    count: files.length,
    totalSize,
  }
}
