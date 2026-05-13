/**
 * Search Worker Manager
 *
 * Runs full-text search in a dedicated worker.
 */

export interface SearchHit {
  path: string
  line: number
  column: number
  match: string
  preview: string
}

/**
 * Overlay for a pending file change.
 * - content: the file content to use instead of disk (string for modify/create)
 * - deleted: if true, the file should be treated as deleted (skip it)
 */
export interface PendingFileOverlay {
  content?: string
  deleted?: boolean
}

export interface SearchInDirectoryOptions {
  path?: string
  query: string
  regex?: boolean
  caseSensitive?: boolean
  wholeWord?: boolean
  glob?: string
  maxResults?: number
  contextLines?: number
  deadlineMs?: number
  maxFileSize?: number
  includeIgnored?: boolean
  excludeDirs?: string[]
  /**
   * OPFS pending overlay map: path -> overlay info.
   * When provided, the worker will use overlay content instead of disk content
   * for files that have pending changes. This ensures search results are consistent
   * with the read tool (which reads from OPFS cache).
   */
  pendingOverlays?: Record<string, PendingFileOverlay>
}

export interface SearchInDirectoryResult {
  results: SearchHit[]
  totalMatches: number
  scannedFiles: number
  skippedFiles: number
  truncated: boolean
  deadlineExceeded: boolean
}

type WorkerMessage =
  | {
      type: 'SEARCH'
      payload: SearchInDirectoryOptions & { directoryHandle: FileSystemDirectoryHandle }
    }
  | { type: 'ABORT' }

type WorkerResponse =
  | { type: 'SEARCH_RESULT'; payload: SearchInDirectoryResult }
  | {
      type: 'ERROR'
      payload: {
        message?: string
        error?: string
        code?: 'path_not_found' | 'search_worker_error'
        requestedPath?: string
        resolvedRootName?: string
      }
    }

interface PendingRequest {
  resolve: (value: SearchInDirectoryResult) => void
  reject: (err: Error) => void
}

class SearchWorkerManager {
  private worker: Worker | null = null
  private current: PendingRequest | null = null
  /**
   * FIFO queue for search requests that arrive while the worker is busy.
   * Each entry holds the message to send and the promise callbacks.
   */
  private queue: Array<{ message: WorkerMessage; pending: PendingRequest }> = []

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (!this.current) return
        if (event.data.type === 'ERROR') {
          const payload = event.data.payload
          const structured = {
            code: payload.code,
            message: payload.message || payload.error || 'Search worker error',
            requestedPath: payload.requestedPath,
            resolvedRootName: payload.resolvedRootName,
          }
          this.current.reject(new Error(JSON.stringify(structured)))
        } else {
          this.current.resolve(event.data.payload)
        }
        this.current = null
        this.processQueue()
      }

      this.worker.onerror = (event: ErrorEvent) => {
        if (this.current) {
          this.current.reject(new Error(event.message || 'Search worker error'))
          this.current = null
          this.processQueue()
        }
      }
    }

    return this.worker
  }

  /**
   * Drain the next queued request (if any) and dispatch it to the worker.
   */
  private processQueue(): void {
    if (this.current || this.queue.length === 0) return
    const { message, pending } = this.queue.shift()!
    this.current = pending
    const worker = this.getWorker()
    worker.postMessage(message)
  }

  async searchInDirectory(
    directoryHandle: FileSystemDirectoryHandle,
    options: SearchInDirectoryOptions
  ): Promise<SearchInDirectoryResult> {
    const message: WorkerMessage = {
      type: 'SEARCH',
      payload: {
        directoryHandle,
        ...options,
      },
    }

    return new Promise<SearchInDirectoryResult>((resolve, reject) => {
      const pending: PendingRequest = { resolve, reject }
      if (!this.current) {
        // Worker is idle — dispatch immediately
        this.current = pending
        const worker = this.getWorker()
        worker.postMessage(message)
      } else {
        // Worker is busy — enqueue for sequential execution
        this.queue.push({ message, pending })
      }
    })
  }

  abort(): void {
    // Clear the queue and reject all pending requests
    for (const { pending } of this.queue) {
      pending.reject(new Error('Search aborted'))
    }
    this.queue = []
    if (this.worker) {
      this.worker.postMessage({ type: 'ABORT' } as WorkerMessage)
    }
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    // Reject any in-flight or queued requests
    if (this.current) {
      this.current.reject(new Error('Search worker terminated'))
      this.current = null
    }
    for (const { pending } of this.queue) {
      pending.reject(new Error('Search worker terminated'))
    }
    this.queue = []
  }
}

let instance: SearchWorkerManager | null = null

export function getSearchWorkerManager(): SearchWorkerManager {
  if (!instance) {
    instance = new SearchWorkerManager()
  }
  return instance
}
