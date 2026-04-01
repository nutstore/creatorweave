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

class SearchWorkerManager {
  private worker: Worker | null = null
  private pending: { resolve: (value: SearchInDirectoryResult) => void; reject: (err: Error) => void } | null =
    null

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (!this.pending) return
        if (event.data.type === 'ERROR') {
          const payload = event.data.payload
          const structured = {
            code: payload.code,
            message: payload.message || payload.error || 'Search worker error',
            requestedPath: payload.requestedPath,
            resolvedRootName: payload.resolvedRootName,
          }
          this.pending.reject(new Error(JSON.stringify(structured)))
        } else {
          this.pending.resolve(event.data.payload)
        }
        this.pending = null
      }

      this.worker.onerror = (event: ErrorEvent) => {
        if (this.pending) {
          this.pending.reject(new Error(event.message || 'Search worker error'))
          this.pending = null
        }
      }
    }

    return this.worker
  }

  async searchInDirectory(
    directoryHandle: FileSystemDirectoryHandle,
    options: SearchInDirectoryOptions
  ): Promise<SearchInDirectoryResult> {
    if (this.pending) {
      throw new Error('Search worker is busy')
    }

    const worker = this.getWorker()
    return new Promise<SearchInDirectoryResult>((resolve, reject) => {
      this.pending = { resolve, reject }
      worker.postMessage({
        type: 'SEARCH',
        payload: {
          directoryHandle,
          ...options,
        },
      } as WorkerMessage)
    })
  }

  abort(): void {
    if (!this.worker) return
    this.worker.postMessage({ type: 'ABORT' } as WorkerMessage)
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.pending = null
  }
}

let instance: SearchWorkerManager | null = null

export function getSearchWorkerManager(): SearchWorkerManager {
  if (!instance) {
    instance = new SearchWorkerManager()
  }
  return instance
}
