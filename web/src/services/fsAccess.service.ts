/**
 * Check if File System Access API is supported
 * @returns true if supported, false otherwise
 */
export function isSupported(): boolean {
  return 'showDirectoryPicker' in window
}

/**
 * Select a folder using File System Access API
 * @returns FileSystemDirectoryHandle
 * @throws Error if API is not supported or user cancels
 */
export async function selectFolder(): Promise<FileSystemDirectoryHandle> {
  if (!isSupported()) {
    throw new Error('File System Access API is not supported')
  }

  try {
    const handle = await window.showDirectoryPicker()
    return handle
  } catch (error) {
    // Handle user cancellation
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('User cancelled')
    }
    throw error
  }
}
