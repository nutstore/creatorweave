/**
 * File metadata
 */
export interface FileMetadata {
  name: string
  size: number
  type: 'file' | 'directory'
  lastModified: number
  path: string
}

/**
 * Traverse directory recursively using async generator
 * @param dirHandle - Directory handle to traverse
 * @param path - Current path (used internally for recursion)
 * @yields FileMetadata for each file found
 */
export async function* traverseDirectory(
  dirHandle: FileSystemDirectoryHandle,
  path: string = ''
): AsyncGenerator<FileMetadata> {
  try {
    for await (const entry of dirHandle.entries()) {
      const [, handle] = entry
      const entryPath = path ? `${path}/${handle.name}` : handle.name

      if (handle.kind === 'file') {
        try {
          const file = await handle.getFile()
          yield {
            name: file.name,
            size: file.size,
            type: 'file',
            lastModified: file.lastModified,
            path: entryPath,
          }
        } catch (error) {
          // Skip files that cannot be accessed
          console.warn(`Skipping ${entryPath}:`, error)
          continue
        }
      } else if (handle.kind === 'directory') {
        // Recursively traverse subdirectories
        yield* traverseDirectory(handle as FileSystemDirectoryHandle, entryPath)
      }
    }
  } catch (error) {
    console.warn(`Error accessing directory:`, error)
    throw error
  }
}
