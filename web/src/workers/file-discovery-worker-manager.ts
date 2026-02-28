/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * File Discovery Worker Manager
 *
 * Manages the file discovery worker and provides a Promise-based API.
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

export interface FileEntry {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
  size: number
  modified: number
  children?: FileEntry[]
}

interface SearchOptions {
  limit?: number
  includeDirectories?: boolean
}

//=============================================================================
// Manager
//=============================================================================

class FileDiscoveryWorkerManager {
  private worker: Worker | null = null
  private messageId = 0
  private pendingCalls = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: any) => void }
  >()

  /**
   * Get or create the worker instance
   */
  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./file-discovery.worker.ts', import.meta.url), {
        type: 'module',
      })

      this.worker.onmessage = (event) => {
        this.handleWorkerMessage(event.data)
      }

      this.worker.onerror = (event) => {
        console.error('[FileDiscoveryWorker] Worker error:', event)
        // Reject all pending calls
        for (const { reject } of this.pendingCalls.values()) {
          reject(new Error('Worker error'))
        }
        this.pendingCalls.clear()
      }
    }
    return this.worker
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(message: any) {
    const errorResponse = message.type === 'ERROR' ? message : null
    const dataResponse = message.type !== 'ERROR' ? message : null

    // Find the pending call - we use FIFO for simplicity since most calls are sequential
    const firstKey = this.pendingCalls.keys().next().value
    if (firstKey === undefined) return

    const { resolve, reject } = this.pendingCalls.get(firstKey)!
    this.pendingCalls.delete(firstKey)

    if (errorResponse) {
      reject(new Error(errorResponse.payload.error))
    } else {
      resolve(dataResponse.payload)
    }
  }

  /**
   * Send message to worker and wait for response
   */
  private async send<T>(message: any): Promise<T> {
    const worker = this.getWorker()
    const id = this.messageId++

    return new Promise<T>((resolve, reject) => {
      this.pendingCalls.set(id, { resolve, reject })
      worker.postMessage(message)
    })
  }

  /**
   * Build file tree from flat metadata array
   */
  async buildTreeFromMetadata(files: FileMetadata[]): Promise<FileEntry | null> {
    return this.send<{ tree: FileEntry | null }>({
      type: 'BUILD_TREE',
      payload: { files },
    }).then((result) => result.tree)
  }

  /**
   * Search files in tree by name
   */
  async search(
    query: string,
    fileTree: FileEntry,
    options: SearchOptions = {}
  ): Promise<FileEntry[]> {
    return this.send<{ results: FileEntry[] }>({
      type: 'SEARCH',
      payload: {
        query,
        fileTree,
        limit: options.limit,
        includeDirectories: options.includeDirectories,
      },
    }).then((result) => result.results)
  }

  /**
   * Flatten file tree to array
   */
  async flattenTree(fileTree: FileEntry): Promise<FileEntry[]> {
    return this.send<{ entries: FileEntry[] }>({
      type: 'FLATTEN',
      payload: { fileTree },
    }).then((result) => result.entries)
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.pendingCalls.clear()
  }
}

// Singleton instance
let managerInstance: FileDiscoveryWorkerManager | null = null

/**
 * Get the singleton file discovery worker manager
 */
export function getFileDiscoveryWorkerManager(): FileDiscoveryWorkerManager {
  if (!managerInstance) {
    managerInstance = new FileDiscoveryWorkerManager()
  }
  return managerInstance
}

// Re-export types for convenience
export type { FileMetadata }
