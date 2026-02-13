/**
 * Diff Worker Manager
 *
 * Manages the diff worker and provides an interface for file scanning
 * and change detection in a background thread.
 */

import type { FileScanItem, ChangeDetectionResult } from './diff.worker'

type WorkerMessage =
  | { type: 'SCAN'; payload: { filesDirHandle: FileSystemDirectoryHandle } }
  | { type: 'DETECT_CHANGES'; payload: { before: Record<string, FileScanItem>; after: Record<string, FileScanItem> } }
  | { type: 'SCAN_AND_COMPARE'; payload: { filesDirHandle: FileSystemDirectoryHandle; before: Record<string, FileScanItem> } }
  | { type: 'ABORT' }

type WorkerResponse =
  | { type: 'SCAN_RESULT'; payload: { files: Record<string, FileScanItem>; totalFiles: number } }
  | { type: 'CHANGE_RESULT'; payload: ChangeDetectionResult }
  | { type: 'PROGRESS'; payload: { currentPath: string; scannedCount: number } }
  | { type: 'COMPLETE'; payload: { totalFiles: number } }
  | { type: 'ERROR'; payload: { error: string } }

export type DiffWorkerProgressCallback = (currentPath: string, scannedCount: number) => void

class DiffWorkerManager {
  private worker: Worker | null = null
  private isProcessing = false
  private resolvePromise: ((value: WorkerResponse) => void) | null = null
  private progressCallback: DiffWorkerProgressCallback | null = null
  private pendingResponses: WorkerResponse[] = []
  private error: Error | null = null

  /**
   * Get or create the worker instance
   */
  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./diff.worker.ts', import.meta.url), {
        type: 'module',
      })

      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(event.data)
      }

      this.worker.onerror = (event: ErrorEvent) => {
        this.error = new Error(`Worker error: ${event.message}`)
        if (this.resolvePromise) {
          this.resolvePromise({ type: 'ERROR', payload: { error: event.message } } as WorkerResponse)
          this.resolvePromise = null
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
      case 'PROGRESS':
        if (this.progressCallback) {
          this.progressCallback(message.payload.currentPath, message.payload.scannedCount)
        }
        break

      case 'SCAN_RESULT':
      case 'CHANGE_RESULT':
      case 'COMPLETE':
      case 'ERROR':
        // Store response for later retrieval
        this.pendingResponses.push(message)
        // If there's a pending promise, resolve it
        if (this.resolvePromise) {
          this.resolvePromise(message)
          this.resolvePromise = null
        }
        break
    }
  }

  /**
   * Wait for the next response
   */
  private waitForResponse(): Promise<WorkerResponse> {
    // If there's already a pending response, return it
    if (this.pendingResponses.length > 0) {
      return Promise.resolve(this.pendingResponses.shift()!)
    }

    // Otherwise wait for a new response
    return new Promise<WorkerResponse>((resolve) => {
      this.resolvePromise = resolve
    })
  }

  /**
   * Scan files in the worker
   * @param filesDirHandle The OPFS directory handle to scan
   * @param onProgress Optional progress callback
   * @returns Map of file path -> FileScanItem
   */
  async scanFiles(
    filesDirHandle: FileSystemDirectoryHandle,
    onProgress?: DiffWorkerProgressCallback
  ): Promise<Map<string, FileScanItem>> {
    if (this.isProcessing) {
      throw new Error('Already processing a scan')
    }

    this.isProcessing = true
    this.progressCallback = onProgress ?? null
    this.error = null
    this.pendingResponses = []

    try {
      const worker = this.getWorker()
      worker.postMessage({
        type: 'SCAN',
        payload: { filesDirHandle },
      } as WorkerMessage)

      // Wait for SCAN_RESULT
      const response = await this.waitForResponse()

      if (response.type === 'ERROR') {
        throw new Error(response.payload.error)
      }

      if (response.type !== 'SCAN_RESULT') {
        throw new Error(`Unexpected response type: ${response.type}`)
      }

      // Convert plain object back to Map
      const filesMap = new Map<string, FileScanItem>()
      for (const [path, item] of Object.entries(response.payload.files)) {
        filesMap.set(path, item)
      }

      return filesMap
    } finally {
      this.isProcessing = false
      this.progressCallback = null
    }
  }

  /**
   * Detect changes between two snapshots
   * @param before Previous file snapshot
   * @param after Current file snapshot
   * @returns Change detection result
   */
  async detectChanges(
    before: Map<string, FileScanItem>,
    after: Map<string, FileScanItem>
  ): Promise<ChangeDetectionResult> {
    if (this.isProcessing) {
      throw new Error('Already processing change detection')
    }

    this.isProcessing = true
    this.error = null
    this.pendingResponses = []

    try {
      const worker = this.getWorker()

      // Convert Maps to serializable objects
      const beforeObj = Object.fromEntries(before)
      const afterObj = Object.fromEntries(after)

      worker.postMessage({
        type: 'DETECT_CHANGES',
        payload: { before: beforeObj, after: afterObj },
      } as WorkerMessage)

      // Wait for CHANGE_RESULT
      const response = await this.waitForResponse()

      if (response.type === 'ERROR') {
        throw new Error(response.payload.error)
      }

      if (response.type !== 'CHANGE_RESULT') {
        throw new Error(`Unexpected response type: ${response.type}`)
      }

      return response.payload
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Scan files and compare with before snapshot in one operation
   * @param filesDirHandle The OPFS directory handle to scan
   * @param before Previous file snapshot
   * @param onProgress Optional progress callback
   * @returns Both the scan result and change detection result
   */
  async scanAndCompare(
    filesDirHandle: FileSystemDirectoryHandle,
    before: Map<string, FileScanItem>,
    onProgress?: DiffWorkerProgressCallback
  ): Promise<{ files: Map<string, FileScanItem>; changes: ChangeDetectionResult }> {
    if (this.isProcessing) {
      throw new Error('Already processing scan and compare')
    }

    this.isProcessing = true
    this.progressCallback = onProgress ?? null
    this.error = null
    this.pendingResponses = []

    try {
      const worker = this.getWorker()

      // Convert Map to serializable object
      const beforeObj = Object.fromEntries(before)

      worker.postMessage({
        type: 'SCAN_AND_COMPARE',
        payload: { filesDirHandle, before: beforeObj },
      } as WorkerMessage)

      // Wait for SCAN_RESULT
      let scanResult: WorkerResponse = await this.waitForResponse()

      if (scanResult.type === 'ERROR') {
        throw new Error(scanResult.payload.error)
      }

      if (scanResult.type !== 'SCAN_RESULT') {
        throw new Error(`Unexpected response type: ${scanResult.type}`)
      }

      // Convert plain object back to Map
      const filesMap = new Map<string, FileScanItem>()
      for (const [path, item] of Object.entries(scanResult.payload.files)) {
        filesMap.set(path, item)
      }

      // Wait for CHANGE_RESULT
      let changeResult: WorkerResponse = await this.waitForResponse()

      if (changeResult.type === 'ERROR') {
        throw new Error(changeResult.payload.error)
      }

      if (changeResult.type !== 'CHANGE_RESULT') {
        throw new Error(`Unexpected response type: ${changeResult.type}`)
      }

      return {
        files: filesMap,
        changes: changeResult.payload,
      }
    } finally {
      this.isProcessing = false
      this.progressCallback = null
    }
  }

  /**
   * Abort the current operation
   */
  abort() {
    if (this.worker) {
      this.worker.postMessage({ type: 'ABORT' } as WorkerMessage)
    }
    this.isProcessing = false
    this.pendingResponses = []
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.isProcessing = false
    this.pendingResponses = []
    this.error = null
    this.resolvePromise = null
  }

  /**
   * Check if worker is currently processing
   */
  get isWorkerProcessing(): boolean {
    return this.isProcessing
  }

  /**
   * Get the last error
   */
  get lastError(): Error | null {
    return this.error
  }
}

// Singleton instance
let managerInstance: DiffWorkerManager | null = null

/**
 * Get the singleton diff worker manager
 */
export function getDiffWorkerManager(): DiffWorkerManager {
  if (!managerInstance) {
    managerInstance = new DiffWorkerManager()
  }
  return managerInstance
}

/**
 * Scan files using worker (alternative to session.scanFiles)
 */
export async function scanFilesInWorker(
  filesDirHandle: FileSystemDirectoryHandle,
  onProgress?: DiffWorkerProgressCallback
): Promise<Map<string, FileScanItem>> {
  const manager = getDiffWorkerManager()
  return manager.scanFiles(filesDirHandle, onProgress)
}

/**
 * Detect changes using worker
 */
export async function detectChangesInWorker(
  before: Map<string, FileScanItem>,
  after: Map<string, FileScanItem>
): Promise<ChangeDetectionResult> {
  const manager = getDiffWorkerManager()
  return manager.detectChanges(before, after)
}

/**
 * Scan and compare using worker (single operation)
 */
export async function scanAndCompareInWorker(
  filesDirHandle: FileSystemDirectoryHandle,
  before: Map<string, FileScanItem>,
  onProgress?: DiffWorkerProgressCallback
): Promise<{ files: Map<string, FileScanItem>; changes: ChangeDetectionResult }> {
  const manager = getDiffWorkerManager()
  return manager.scanAndCompare(filesDirHandle, before, onProgress)
}

/**
 * Abort any ongoing diff operation
 */
export function abortDiffOperation() {
  if (managerInstance) {
    managerInstance.abort()
  }
}

/**
 * Terminate the diff worker
 */
export function terminateDiffWorker() {
  if (managerInstance) {
    managerInstance.terminate()
    managerInstance = null
  }
}
