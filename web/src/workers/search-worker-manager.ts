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
  | { type: 'ERROR'; payload: { error: string } }

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
          this.pending.reject(new Error(event.data.payload.error))
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
