/**
 * File Discovery Service - Host side
 *
 * Provides file search and recent files tracking for Remote sessions.
 * Heavy operations are delegated to a worker to avoid blocking the main thread.
 */

import { type FileEntry } from '@/remote/remote-protocol'
import type { FileMetadata as TraversalFileMetadata } from '@/services/traversal.service'

// Re-export FileMetadata type for convenience
export type FileMetadata = TraversalFileMetadata

// Import worker types
import type { FileEntry as WorkerFileEntry } from '@/workers/file-discovery-worker-manager'

// ============================================================================
// Types
// ============================================================================

interface SearchOptions {
  limit?: number
  includeDirectories?: boolean
  useWorker?: boolean // Whether to use worker for search
}

interface RecentFileEntry extends FileEntry {
  lastAccessed: number
  accessCount: number
}

interface FileTreeNode {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  size?: number
  modified?: number
}

// ============================================================================
// Service
// ============================================================================

class FileDiscoveryService {
  private recentFiles: Map<string, RecentFileEntry> = new Map()
  private maxRecentFiles = 10
  private cachedFileTree: FileEntry | null = null

  // ==========================================================================
  // Search
  // ==========================================================================

  /**
   * Search files by name (supports fuzzy matching)
   * Uses worker by default for large trees, falls back to sync for small trees
   */
  async search(
    query: string,
    fileTree: FileEntry[],
    options: SearchOptions = {}
  ): Promise<FileEntry[]> {
    const { limit = 50, includeDirectories = false, useWorker = true } = options

    if (!query.trim()) {
      return []
    }

    // Build a virtual root from the file tree array
    const virtualRoot: FileEntry = {
      path: '',
      name: 'root',
      type: 'directory',
      size: 0,
      modified: 0,
      children: fileTree,
    }

    // Use worker for large trees or when explicitly requested
    if (useWorker && fileTree.length > 100) {
      try {
        const manager = await import('@/workers/file-discovery-worker-manager')
        const results = await manager
          .getFileDiscoveryWorkerManager()
          .search(query, virtualRoot as WorkerFileEntry, { limit, includeDirectories })
        return results as FileEntry[]
      } catch (error) {
        console.warn('[FileDiscoveryService] Worker search failed, falling back:', error)
      }
    }

    // Fallback: synchronous search
    return this.searchSync(query, virtualRoot, { limit, includeDirectories })
  }

  /**
   * Synchronous search (fallback for small trees or worker failures)
   */
  private searchSync(query: string, fileTree: FileEntry, options: SearchOptions = {}): FileEntry[] {
    const { limit = 50, includeDirectories = false } = options
    const lowerQuery = query.toLowerCase()
    const results: FileEntry[] = []

    // Recursive search through file tree
    const searchRecursive = (entries: FileEntry[]): boolean => {
      for (const entry of entries) {
        // Match file name
        const match = this.matchFileName(entry.name, lowerQuery)

        if (match) {
          // Skip directories if not included
          if (entry.type === 'file' || includeDirectories) {
            results.push(entry)

            if (results.length >= limit) {
              return true // Stop searching
            }
          }
        }

        // Recursively search directories
        if (entry.type === 'directory' && entry.children) {
          if (searchRecursive(entry.children)) {
            return true
          }
        }
      }
      return false
    }

    if (fileTree.children) {
      searchRecursive(fileTree.children)
    }

    return results
  }

  /**
   * Match file name against query (fuzzy matching)
   */
  private matchFileName(fileName: string, query: string): boolean {
    const lowerName = fileName.toLowerCase()

    // Exact match
    if (lowerName === query) {
      return true
    }

    // Contains match
    if (lowerName.includes(query)) {
      return true
    }

    // Starts with match
    if (lowerName.startsWith(query)) {
      return true
    }

    // Fuzzy match: match first letters of parts
    // e.g., "fc" matches "FileController.ts"
    const parts = lowerName.split(/[^a-z0-9]/)
    const firstLetters = parts
      .filter((p) => p.length > 0)
      .map((p) => p[0])
      .join('')
    if (firstLetters.includes(query)) {
      return true
    }

    return false
  }

  // ==========================================================================
  // Recent Files
  // ==========================================================================

  /**
   * Track a file access (called when user views/edits a file)
   */
  trackFileAccess(file: FileEntry): void {
    const existing = this.recentFiles.get(file.path)

    if (existing) {
      // Update existing entry
      existing.lastAccessed = Date.now()
      existing.accessCount++
    } else {
      // Add new entry
      this.recentFiles.set(file.path, {
        ...file,
        lastAccessed: Date.now(),
        accessCount: 1,
      })
    }

    // Trim to max size
    this.trimRecentFiles()
  }

  /**
   * Get recent files list, sorted by last accessed
   */
  getRecentFiles(): FileEntry[] {
    return Array.from(this.recentFiles.values())
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, this.maxRecentFiles)
      .map((entry) => {
        const { lastAccessed, accessCount, ...file } = entry
        void lastAccessed
        void accessCount
        return file
      })
  }

  /**
   * Clear recent files (e.g., when switching directories)
   */
  clearRecentFiles(): void {
    this.recentFiles.clear()
  }

  /**
   * Trim recent files to max size
   */
  private trimRecentFiles(): void {
    if (this.recentFiles.size <= this.maxRecentFiles) {
      return
    }

    // Sort by last accessed and remove oldest
    const sorted = Array.from(this.recentFiles.entries()).sort(
      (a, b) => a[1].lastAccessed - b[1].lastAccessed
    )

    const toRemove = sorted.slice(0, this.recentFiles.size - this.maxRecentFiles)
    for (const [path] of toRemove) {
      this.recentFiles.delete(path)
    }
  }

  // ==========================================================================
  // File Tree Conversion
  // ==========================================================================

  /**
   * Build a hierarchical FileEntry tree from flat FileMetadata array
   * Uses worker by default for large datasets
   *
   * @param files - Flat array of file metadata
   * @param useWorker - Whether to use worker (default: true for >100 files)
   * @returns Hierarchical file tree or null
   */
  async buildFileTreeFromMetadata(
    files: FileMetadata[],
    useWorker?: boolean
  ): Promise<FileEntry | null> {
    const shouldUseWorker = useWorker ?? files.length > 100

    if (shouldUseWorker) {
      try {
        const manager = await import('@/workers/file-discovery-worker-manager')
        const tree = await manager.getFileDiscoveryWorkerManager().buildTreeFromMetadata(files)
        this.cachedFileTree = tree as FileEntry
        return this.cachedFileTree
      } catch (error) {
        console.warn('[FileDiscoveryService] Worker buildTree failed, falling back:', error)
      }
    }

    // Fallback: synchronous O(n) build
    const tree = this.buildFileTreeFromMetadataSync(files)
    this.cachedFileTree = tree
    return tree
  }

  /**
   * Synchronous file tree building (optimized O(n) algorithm)
   */
  private buildFileTreeFromMetadataSync(files: FileMetadata[]): FileEntry | null {
    if (files.length === 0) return null

    // Sort paths by depth (shallowest first)
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

    // Second pass: build hierarchy
    const rootEntries: FileEntry[] = []

    for (const [path, entry] of entryMap) {
      const lastSlashIndex = path.lastIndexOf('/')
      if (lastSlashIndex === -1) {
        rootEntries.push(entry)
      } else {
        const parentPath = path.substring(0, lastSlashIndex)
        const parent = entryMap.get(parentPath)

        if (parent && parent.children) {
          parent.children.push(entry)
        } else {
          rootEntries.push(entry)
        }
      }
    }

    // Create appropriate root structure
    if (rootEntries.length === 0) return null
    if (rootEntries.length === 1) return rootEntries[0]

    return {
      path: '',
      name: 'root',
      type: 'directory',
      size: 0,
      modified: 0,
      children: rootEntries,
    }
  }

  /**
   * Convert filesystem store tree to FileEntry format
   */
  convertToFileEntry(node: FileTreeNode): FileEntry {
    return {
      path: node.path,
      name: node.name,
      type: node.type,
      extension: node.extension,
      size: node.size,
      modified: node.modified,
    }
  }

  /**
   * Convert entire file tree to flat array for search
   * Uses worker for large trees
   */
  async convertFileTreeToFlat(root: FileEntry, useWorker?: boolean): Promise<FileEntry[]> {
    const shouldUseWorker = useWorker ?? true

    if (shouldUseWorker) {
      try {
        const manager = await import('@/workers/file-discovery-worker-manager')
        return (await manager
          .getFileDiscoveryWorkerManager()
          .flattenTree(root as WorkerFileEntry)) as FileEntry[]
      } catch (error) {
        console.warn('[FileDiscoveryService] Worker flatten failed, falling back:', error)
      }
    }

    // Fallback: synchronous flatten
    return this.convertFileTreeToFlatSync(root)
  }

  /**
   * Synchronous flatten (fallback)
   */
  private convertFileTreeToFlatSync(root: FileEntry): FileEntry[] {
    const result: FileEntry[] = []
    const stack: FileEntry[] = [root]

    while (stack.length > 0) {
      const entry = stack.pop()!
      if (!entry) continue

      result.push(entry)

      if (entry.type === 'directory' && entry.children) {
        // Add children in reverse order to maintain original order
        for (let i = entry.children.length - 1; i >= 0; i--) {
          stack.push(entry.children[i])
        }
      }
    }

    return result
  }

  /**
   * Get cached file tree
   */
  getCachedFileTree(): FileEntry | null {
    return this.cachedFileTree
  }

  /**
   * Clear cached file tree
   */
  clearCache(): void {
    this.cachedFileTree = null
  }
}

// ============================================================================
// Singleton
// ============================================================================

export const fileDiscoveryService = new FileDiscoveryService()
