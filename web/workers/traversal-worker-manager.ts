/**
 * Traversal Worker Manager
 *
 * Manages the traversal worker and provides an async generator interface
 * that's compatible with the original traverseDirectory function.
 */

import type { FileMetadata } from '@/services/traversal.service'

type WorkerMessage =
  | { type: 'TRAVERSE'; payload: { directoryHandle: FileSystemDirectoryHandle; basePath?: string } }
  | { type: 'ABORT' }

type WorkerResponse =
  | { type: 'RESULT'; payload: { items: FileMetadata[]; done: boolean; currentPath: string } }
  | { type: 'COMPLETE'; payload: { totalFiles: number; totalDirs: number } }
  | { type: 'ERROR'; payload: { error: string } }

class TraversalWorkerManager {
  private worker: Worker | null = null
  private pendingItems: FileMetadata[] = []
  private isComplete = false
  private resolveNext: ((value: boolean) => void) | null = null
  private error: Error | null = null

  /**
   * Get or create the worker instance
   */
  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./traversal.worker.ts', import.meta.url), {
        type: 'module',
      })

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(event.data)
      }

      this.worker.onerror = (event) => {
        this.error = new Error(`Worker error: ${event.message}`)
        if (this.resolveNext) {
          this.resolveNext(false)
        }
      }
    }
    return this.worker
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(message: WorkerResponse) {
    switch (message.type) {
      case 'RESULT':
        this.pendingItems.push(...message.payload.items)
        if (this.resolveNext) {
          this.resolveNext(true)
          this.resolveNext = null
        }
        break

      case 'COMPLETE':
        this.isComplete = true
        if (this.resolveNext) {
          this.resolveNext(false)
        }
        break

      case 'ERROR':
        this.error = new Error(message.payload.error)
        if (this.resolveNext) {
          this.resolveNext(false)
        }
        break
    }
  }

  /**
   * Start traversal and return an async generator
   */
  async *traverse(
    directoryHandle: FileSystemDirectoryHandle,
    basePath: string = ''
  ): AsyncGenerator<FileMetadata> {
    // Reset state
    this.pendingItems = []
    this.isComplete = false
    this.error = null

    // Send traversal request to worker
    const worker = this.getWorker()
    worker.postMessage({
      type: 'TRAVERSE',
      payload: { directoryHandle, basePath },
    } as WorkerMessage)

    // Yield items as they arrive
    while (!this.isComplete && !this.error) {
      if (this.pendingItems.length === 0) {
        // Wait for worker to send more items
        await new Promise<boolean>((resolve) => {
          this.resolveNext = resolve
        })
      }

      // Yield all pending items
      while (this.pendingItems.length > 0) {
        yield this.pendingItems.shift()!
      }

      if (this.isComplete) break
    }

    // Throw error if one occurred
    if (this.error) {
      throw this.error
    }
  }

  /**
   * Abort the current traversal
   */
  abort() {
    if (this.worker) {
      this.worker.postMessage({ type: 'ABORT' } as WorkerMessage)
    }
    this.pendingItems = []
    this.isComplete = true
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.pendingItems = []
    this.isComplete = false
    this.error = null
    this.resolveNext = null
  }
}

// Singleton instance
let managerInstance: TraversalWorkerManager | null = null

/**
 * Get the singleton traversal worker manager
 */
export function getTraversalWorkerManager(): TraversalWorkerManager {
  if (!managerInstance) {
    managerInstance = new TraversalWorkerManager()
  }
  return managerInstance
}

/**
 * Traverse directory using worker (drop-in replacement for traverseDirectory)
 */
export async function* traverseDirectoryInWorker(
  directoryHandle: FileSystemDirectoryHandle,
  basePath: string = ''
): AsyncGenerator<FileMetadata> {
  const manager = getTraversalWorkerManager()
  yield* manager.traverse(directoryHandle, basePath)
}

/**
 * Abort any ongoing traversal
 */
export function abortTraversal() {
  if (managerInstance) {
    managerInstance.abort()
  }
}
