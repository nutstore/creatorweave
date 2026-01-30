/**
 * Check if File System Access API is supported
 * @returns true if supported, false otherwise
 */
export function isSupported(): boolean {
  return 'showDirectoryPicker' in window
}

/**
 * Select a folder with readwrite permission for Agent file operations.
 * @returns FileSystemDirectoryHandle with write access
 */
export async function selectFolderReadWrite(): Promise<FileSystemDirectoryHandle> {
  if (!isSupported()) {
    throw new Error('File System Access API is not supported')
  }

  try {
    const handle = await (
      window.showDirectoryPicker as (options?: {
        mode?: 'read' | 'readwrite'
        id?: string
        startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
      }) => Promise<FileSystemDirectoryHandle>
    )({
      mode: 'readwrite',
    })
    return handle
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('User cancelled')
    }
    throw error
  }
}

/**
 * Resolve a file path to a FileSystemFileHandle from a root directory.
 * @param dirHandle Root directory handle
 * @param filePath Relative file path (e.g. "src/index.ts")
 */
export async function resolveFileHandle(
  dirHandle: FileSystemDirectoryHandle,
  filePath: string
): Promise<FileSystemFileHandle> {
  const parts = filePath.split('/').filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) throw new Error(`Invalid file path: ${filePath}`)

  let current = dirHandle
  for (const part of parts) {
    current = await current.getDirectoryHandle(part)
  }
  return current.getFileHandle(fileName)
}

/**
 * Resolve a directory path to a FileSystemDirectoryHandle.
 * @param dirHandle Root directory handle
 * @param dirPath Relative directory path (e.g. "src/components")
 */
export async function resolveDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  dirPath: string
): Promise<FileSystemDirectoryHandle> {
  if (!dirPath || dirPath === '.' || dirPath === '/') return dirHandle
  const parts = dirPath.split('/').filter(Boolean)
  let current = dirHandle
  for (const part of parts) {
    current = await current.getDirectoryHandle(part)
  }
  return current
}

/**
 * Create a file and all necessary parent directories.
 * @param dirHandle Root directory handle
 * @param filePath Relative file path
 * @returns FileSystemFileHandle for the created file
 */
export async function createFileWithDirs(
  dirHandle: FileSystemDirectoryHandle,
  filePath: string
): Promise<FileSystemFileHandle> {
  const parts = filePath.split('/').filter(Boolean)
  const fileName = parts.pop()
  if (!fileName) throw new Error(`Invalid file path: ${filePath}`)

  let current = dirHandle
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true })
  }
  return current.getFileHandle(fileName, { create: true })
}

/**
 * Select a folder using File System Access API and save the handle
 * @param saveHandle Whether to save the handle for future use (requires user permission)
 * @returns FileSystemDirectoryHandle
 * @throws Error if API is not supported or user cancels
 */
export async function selectFolder(saveHandle: boolean = true): Promise<FileSystemDirectoryHandle> {
  console.log('[fsAccess] selectFolder called, saveHandle:', saveHandle)
  if (!isSupported()) {
    throw new Error('File System Access API is not supported')
  }

  try {
    console.log('[fsAccess] Calling showDirectoryPicker...')
    const handle = await (
      window.showDirectoryPicker as (options?: {
        mode?: 'read' | 'readwrite'
        id?: string
        startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos'
      }) => Promise<FileSystemDirectoryHandle>
    )({
      mode: 'read',
      // Don't use persistent id - it skips the picker dialog on subsequent calls
      // id: 'bfosa-folder',
    })
    console.log('[fsAccess] Folder selected:', handle.name)

    if (saveHandle) {
      const { saveDirectoryHandle } = await import('./handle-storage.service')
      // Try to save the handle with persistent permission
      try {
        await saveDirectoryHandle(handle, handle.name || 'Selected Folder')
        console.log('[fsAccess] Handle saved with persistent permission')
      } catch (error) {
        console.warn('[fsAccess] Could not save handle with persistent permission:', error)
        // Still return the handle for this session
      }
    }

    return handle
  } catch (error) {
    // Handle user cancellation
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('User cancelled')
    }
    throw error
  }
}

/**
 * Select a folder using a saved handle (if available)
 * @param forceNewSelection - Force showing the picker even if a saved handle exists
 * @returns FileSystemDirectoryHandle or null
 */
export async function selectFolderOrUseSaved(
  forceNewSelection: boolean = false
): Promise<FileSystemDirectoryHandle | null> {
  console.log('[fsAccess] selectFolderOrUseSaved called, forceNewSelection:', forceNewSelection)

  // If forcing new selection, always show picker
  if (forceNewSelection) {
    console.log('[fsAccess] Forcing new selection - calling selectFolder')
    return selectFolder(true)
  }

  const { loadDirectoryHandle, hasSavedHandle } = await import('./handle-storage.service')

  // Check if we have a saved handle
  if (await hasSavedHandle()) {
    console.log('[fsAccess] Found saved handle, loading...')
    const saved = await loadDirectoryHandle()
    if (saved) {
      // Verify the handle is still accessible
      try {
        // Try to access the handle to verify it's still valid
        for await (const _entry of (saved.handle as any).values()) {
          // Just checking if we can iterate
          break
        }
        console.log('[fsAccess] Using saved handle:', saved.path)
        return saved.handle
      } catch (error) {
        console.warn('[fsAccess] Saved handle is no longer accessible:', error)
        await import('./handle-storage.service').then((m) => m.clearDirectoryHandle())
      }
    }
  }

  // No saved handle or handle is invalid, select new folder
  console.log('[fsAccess] No saved handle, calling selectFolder')
  return selectFolder(true)
}
