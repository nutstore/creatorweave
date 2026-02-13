/**
 * Diff Worker - File change detection in a separate thread
 *
 * This worker handles file scanning and change detection without blocking the main thread.
 * FileSystemDirectoryHandle is transferred to the worker where all operations happen.
 * OPFS API is available in Worker context.
 */

//=============================================================================
// Type Definitions
//=============================================================================

export interface FileScanItem {
  path: string
  mtime: number
  size: number
}

export interface FileChange {
  type: 'add' | 'modify' | 'delete'
  path: string
  size?: number
  mtime?: number
}

export interface ChangeDetectionResult {
  changes: FileChange[]
  added: number
  modified: number
  deleted: number
}

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

//=============================================================================
// Worker State
//=============================================================================

let abortController = new AbortController()
let isProcessing = false

//=============================================================================
// Message Handler
//=============================================================================

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  try {
    switch (message.type) {
      case 'SCAN':
        await handleScan(message.payload)
        break
      case 'DETECT_CHANGES':
        await handleDetectChanges(message.payload)
        break
      case 'SCAN_AND_COMPARE':
        await handleScanAndCompare(message.payload)
        break
      case 'ABORT':
        handleAbort()
        break
      default:
        sendError({ error: `Unknown message type: ${(message as any).type}` })
    }
  } catch (error) {
    sendError({ error: String(error) })
  }
}

//=============================================================================
// Scan Logic
//=============================================================================

/**
 * Handle scan request - scans files/ directory tree entirely in worker
 */
async function handleScan(payload: { filesDirHandle: FileSystemDirectoryHandle }) {
  if (isProcessing) {
    sendError({ error: 'Already processing a scan' })
    return
  }

  isProcessing = true
  abortController = new AbortController()
  const signal = abortController.signal

  try {
    const { filesDirHandle } = payload
    const result = new Map<string, FileScanItem>()
    let scannedCount = 0
    const PROGRESS_INTERVAL = 50

    // Recursive scan function
    async function* scanDir(
      dir: FileSystemDirectoryHandle,
      prefix: string = ''
    ): AsyncGenerator<FileScanItem> {
      if (signal.aborted) return

      try {
        for await (const entry of dir.values()) {
          if (signal.aborted) return

          const path = prefix ? `${prefix}/${entry.name}` : entry.name

          if (entry.kind === 'file') {
            try {
              const file = await entry.getFile()
              yield {
                path,
                mtime: file.lastModified,
                size: file.size,
              }
            } catch (error) {
              // Skip inaccessible files
              console.warn(`Skipping file ${path}:`, error)
            }
          } else if (entry.kind === 'directory') {
            // Recursively scan subdirectory
            yield* scanDir(entry as FileSystemDirectoryHandle, path)
          }
        }
      } catch (error) {
        console.warn(`Error accessing directory:`, error)
      }
    }

    // Process scan and collect results
    for await (const item of scanDir(filesDirHandle)) {
      if (signal.aborted) {
        return
      }

      result.set(item.path, item)
      scannedCount++

      // Send progress periodically
      if (scannedCount % PROGRESS_INTERVAL === 0) {
        sendProgress({
          currentPath: item.path,
          scannedCount,
        })
        // Yield control to allow processing abort messages
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    // Send final result
    sendScanResult({
      files: Object.fromEntries(result),
      totalFiles: scannedCount,
    })

    // Send completion
    sendComplete({ totalFiles: scannedCount })
  } finally {
    isProcessing = false
  }
}

/**
 * Handle detect changes request - compares two snapshots
 */
async function handleDetectChanges(payload: {
  before: Record<string, FileScanItem>
  after: Record<string, FileScanItem>
}) {
  if (isProcessing) {
    sendError({ error: 'Already processing change detection' })
    return
  }

  isProcessing = true

  try {
    const { before, after } = payload
    const changes: FileChange[] = []
    let added = 0
    let modified = 0
    let deleted = 0

    const beforePaths = new Set(Object.keys(before))

    // Check for added and modified files (in after but not in before, or different mtime)
    for (const [path, item] of Object.entries(after)) {
      const beforeItem = before[path]

      if (!beforeItem) {
        // New file
        changes.push({ type: 'add', path, size: item.size, mtime: item.mtime })
        added++
      } else if (beforeItem.mtime !== item.mtime || beforeItem.size !== item.size) {
        // Modified file
        changes.push({ type: 'modify', path, size: item.size, mtime: item.mtime })
        modified++
      }
    }

    // Check for deleted files (in before but not in after)
    for (const path of beforePaths) {
      if (!after[path]) {
        changes.push({ type: 'delete', path })
        deleted++
      }
    }

    // Send change detection result
    sendChangeResult({
      changes,
      added,
      modified,
      deleted,
    })
  } finally {
    isProcessing = false
  }
}

/**
 * Handle scan and compare request - scan files and compare with before snapshot
 */
async function handleScanAndCompare(payload: {
  filesDirHandle: FileSystemDirectoryHandle
  before: Record<string, FileScanItem>
}) {
  if (isProcessing) {
    sendError({ error: 'Already processing scan and compare' })
    return
  }

  isProcessing = true
  abortController = new AbortController()
  const signal = abortController.signal

  try {
    const { filesDirHandle, before } = payload
    const after = new Map<string, FileScanItem>()
    let scannedCount = 0
    const PROGRESS_INTERVAL = 50

    // Recursive scan function
    async function* scanDir(
      dir: FileSystemDirectoryHandle,
      prefix: string = ''
    ): AsyncGenerator<FileScanItem> {
      if (signal.aborted) return

      try {
        for await (const entry of dir.values()) {
          if (signal.aborted) return

          const path = prefix ? `${prefix}/${entry.name}` : entry.name

          if (entry.kind === 'file') {
            try {
              const file = await entry.getFile()
              yield {
                path,
                mtime: file.lastModified,
                size: file.size,
              }
            } catch (error) {
              // Skip inaccessible files
              console.warn(`Skipping file ${path}:`, error)
            }
          } else if (entry.kind === 'directory') {
            // Recursively scan subdirectory
            yield* scanDir(entry as FileSystemDirectoryHandle, path)
          }
        }
      } catch (error) {
        console.warn(`Error accessing directory:`, error)
      }
    }

    // Process scan and collect results
    for await (const item of scanDir(filesDirHandle)) {
      if (signal.aborted) {
        return
      }

      after.set(item.path, item)
      scannedCount++

      // Send progress periodically
      if (scannedCount % PROGRESS_INTERVAL === 0) {
        sendProgress({
          currentPath: item.path,
          scannedCount,
        })
        // Yield control to allow processing abort messages
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    // Now detect changes
    const changes: FileChange[] = []
    let added = 0
    let modified = 0
    let deleted = 0

    const beforePaths = new Set(Object.keys(before))

    // Check for added and modified files
    for (const [path, item] of after.entries()) {
      const beforeItem = before[path]

      if (!beforeItem) {
        // New file
        changes.push({ type: 'add', path, size: item.size, mtime: item.mtime })
        added++
      } else if (beforeItem.mtime !== item.mtime || beforeItem.size !== item.size) {
        // Modified file
        changes.push({ type: 'modify', path, size: item.size, mtime: item.mtime })
        modified++
      }
    }

    // Check for deleted files
    for (const path of beforePaths) {
      if (!after.has(path)) {
        changes.push({ type: 'delete', path })
        deleted++
      }
    }

    // Send both scan result and change result
    sendScanResult({
      files: Object.fromEntries(after),
      totalFiles: scannedCount,
    })

    sendChangeResult({
      changes,
      added,
      modified,
      deleted,
    })

    sendComplete({ totalFiles: scannedCount })
  } finally {
    isProcessing = false
  }
}

/**
 * Handle abort request
 */
function handleAbort() {
  abortController.abort()
  isProcessing = false
}

//=============================================================================
// Helper Functions
//=============================================================================

function sendScanResult(payload: { files: Record<string, FileScanItem>; totalFiles: number }) {
  const response: WorkerResponse = {
    type: 'SCAN_RESULT',
    payload,
  }
  self.postMessage(response)
}

function sendChangeResult(payload: ChangeDetectionResult) {
  const response: WorkerResponse = {
    type: 'CHANGE_RESULT',
    payload,
  }
  self.postMessage(response)
}

function sendProgress(payload: { currentPath: string; scannedCount: number }) {
  const response: WorkerResponse = {
    type: 'PROGRESS',
    payload,
  }
  self.postMessage(response)
}

function sendComplete(payload: { totalFiles: number }) {
  const response: WorkerResponse = {
    type: 'COMPLETE',
    payload,
  }
  self.postMessage(response)
}

function sendError(payload: { error: string }) {
  const response: WorkerResponse = {
    type: 'ERROR',
    payload,
  }
  self.postMessage(response)
}

// Export types for TypeScript
export type {}
