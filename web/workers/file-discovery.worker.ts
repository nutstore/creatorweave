/**
 * File Discovery Worker - File tree operations in a separate thread
 *
 * Handles expensive file tree operations without blocking the main thread:
 * - Build file tree from flat metadata (O(n) algorithm)
 * - Search files with fuzzy matching
 * - Flatten tree to array
 */

//=============================================================================
// Types
//=============================================================================

interface FileMetadata {
  name: string
  size: number
  type: 'file' | 'directory'
  lastModified: number
  path: string
}

interface FileEntry {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  size: number
  modified: number
  children?: FileEntry[]
}

type WorkerMessage =
  | { type: 'BUILD_TREE'; payload: { files: FileMetadata[] } }
  | {
      type: 'SEARCH'
      payload: { query: string; fileTree: FileEntry; limit?: number; includeDirectories?: boolean }
    }
  | { type: 'FLATTEN'; payload: { fileTree: FileEntry } }

type WorkerResponse =
  | { type: 'TREE_BUILT'; payload: { tree: FileEntry | null } }
  | { type: 'SEARCH_RESULT'; payload: { results: FileEntry[] } }
  | { type: 'FLATTEN_RESULT'; payload: { entries: FileEntry[] } }
  | { type: 'ERROR'; payload: { error: string } }

//=============================================================================
// Message Handler
//=============================================================================

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  try {
    switch (message.type) {
      case 'BUILD_TREE':
        handleBuildTree(message.payload)
        break
      case 'SEARCH':
        handleSearch(message.payload)
        break
      case 'FLATTEN':
        handleFlatten(message.payload)
        break
      default:
        sendError({ error: `Unknown message type: ${(message as any).type}` })
    }
  } catch (error) {
    sendError({ error: String(error) })
  }
}

//=============================================================================
// Build File Tree (Optimized O(n) algorithm)
//=============================================================================

function handleBuildTree(payload: { files: FileMetadata[] }) {
  const { files } = payload

  if (files.length === 0) {
    sendResult({ type: 'TREE_BUILT', payload: { tree: null } })
    return
  }

  // O(n) algorithm: single pass to build tree using path hierarchy
  const startTime = performance.now()

  // Sort paths by depth (shallowest first) to ensure parents are created before children
  const sortedFiles = [...files].sort((a, b) => {
    const aDepth = a.path.split('/').length
    const bDepth = b.path.split('/').length
    return aDepth - bDepth
  })

  // Map to store entries by path for O(1) lookup
  const entryMap = new Map<string, FileEntry>()

  // First pass: create all entries
  for (const file of sortedFiles) {
    const extension = file.type === 'file' ? file.name.split('.').pop() || '' : undefined

    const entry: FileEntry = {
      path: file.path,
      name: file.name,
      type: file.type,
      extension,
      size: file.size,
      modified: file.lastModified,
      children: file.type === 'directory' ? [] : undefined,
    }
    entryMap.set(file.path, entry)
  }

  // Second pass: build hierarchy by linking children to parents
  const rootEntries: FileEntry[] = []

  for (const [path, entry] of entryMap) {
    // Find parent directory
    const lastSlashIndex = path.lastIndexOf('/')
    if (lastSlashIndex === -1) {
      // Root level entry
      rootEntries.push(entry)
    } else {
      const parentPath = path.substring(0, lastSlashIndex)
      const parent = entryMap.get(parentPath)

      if (parent && parent.children) {
        parent.children.push(entry)
      } else {
        // Parent not in our set, treat as root level
        rootEntries.push(entry)
      }
    }
  }

  // Create appropriate root structure
  let result: FileEntry | null = null

  if (rootEntries.length === 0) {
    result = null
  } else if (rootEntries.length === 1) {
    result = rootEntries[0]
  } else {
    // Multiple root entries - create virtual root
    result = {
      path: '',
      name: 'root',
      type: 'directory',
      size: 0,
      modified: 0,
      children: rootEntries,
    }
  }

  const elapsed = performance.now() - startTime
  console.log(
    `[FileDiscoveryWorker] Built tree from ${files.length} entries in ${elapsed.toFixed(2)}ms`
  )

  sendResult({ type: 'TREE_BUILT', payload: { tree: result } })
}

//=============================================================================
// Search
//=============================================================================

function handleSearch(payload: {
  query: string
  fileTree: FileEntry
  limit?: number
  includeDirectories?: boolean
}) {
  const { query, fileTree, limit = 50, includeDirectories = false } = payload

  if (!query.trim()) {
    sendResult({ type: 'SEARCH_RESULT', payload: { results: [] } })
    return
  }

  const startTime = performance.now()
  const lowerQuery = query.toLowerCase()
  const results: FileEntry[] = []

  // Iterative DFS with stack (avoid call stack limits)
  const stack: FileEntry[] = [fileTree]

  while (stack.length > 0 && results.length < limit) {
    const entry = stack.pop()!
    if (!entry) continue

    // Check if this entry matches
    if (matchFileName(entry.name, lowerQuery)) {
      if (entry.type === 'file' || includeDirectories) {
        results.push(entry)
      }
    }

    // Add children to stack (reverse to maintain order)
    if (entry.type === 'directory' && entry.children) {
      for (let i = entry.children.length - 1; i >= 0; i--) {
        stack.push(entry.children[i])
      }
    }
  }

  const elapsed = performance.now() - startTime
  console.log(
    `[FileDiscoveryWorker] Search found ${results.length} results in ${elapsed.toFixed(2)}ms`
  )

  sendResult({ type: 'SEARCH_RESULT', payload: { results } })
}

/**
 * Match file name against query (fuzzy matching)
 */
function matchFileName(fileName: string, query: string): boolean {
  const lowerName = fileName.toLowerCase()

  // Exact match
  if (lowerName === query) return true

  // Contains match
  if (lowerName.includes(query)) return true

  // Starts with match
  if (lowerName.startsWith(query)) return true

  // Fuzzy match: match first letters of parts
  // e.g., "fc" matches "FileController.ts"
  const parts = lowerName.split(/[^a-z0-9]/)
  const firstLetters = parts
    .filter((p) => p.length > 0)
    .map((p) => p[0])
    .join('')
  if (firstLetters.includes(query)) return true

  return false
}

//=============================================================================
// Flatten Tree
//=============================================================================

function handleFlatten(payload: { fileTree: FileEntry }) {
  const { fileTree } = payload
  const startTime = performance.now()

  const result: FileEntry[] = []

  // Iterative traversal
  const stack: FileEntry[] = [fileTree]

  while (stack.length > 0) {
    const entry = stack.pop()!
    if (!entry) continue

    result.push(entry)

    // Add children to stack (reverse to maintain order)
    if (entry.type === 'directory' && entry.children) {
      for (let i = entry.children.length - 1; i >= 0; i--) {
        stack.push(entry.children[i])
      }
    }
  }

  const elapsed = performance.now() - startTime
  console.log(`[FileDiscoveryWorker] Flattened ${result.length} entries in ${elapsed.toFixed(2)}ms`)

  sendResult({ type: 'FLATTEN_RESULT', payload: { entries: result } })
}

//=============================================================================
// Helper Functions
//=============================================================================

function sendResult(response: WorkerResponse) {
  self.postMessage(response)
}

function sendError(payload: { error: string }) {
  self.postMessage({ type: 'ERROR', payload })
}

// Export types for TypeScript
export type {}
