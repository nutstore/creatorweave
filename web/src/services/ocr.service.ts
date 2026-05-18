/**
 * OCR Service — browser-side image text recognition using Tesseract.js.
 *
 * Design:
 * - Lazy loading: Tesseract.js is only imported when OCR is actually needed.
 * - Worker reuse: A single Tesseract worker is created once and reused.
 * - Queue: Images are processed sequentially to avoid memory spikes.
 * - Timeout: Single image recognition has a 30s timeout guard.
 * - Both OCR text and base64 data are produced for dual-mode consumption
 *   (OCR as fallback, Vision API as enhancement).
 */

export type OcrStatus = 'idle' | 'loading' | 'processing' | 'done' | 'failed' | 'timeout'

export interface OcrResult {
  /** Recognized text (empty string if nothing recognized) */
  text: string
  /** Base64-encoded image data (without data URI prefix) */
  base64Data: string
  /** MIME type of the image */
  mimeType: string
  /** Status of the OCR operation */
  status: OcrStatus
  /** Error message if failed */
  error?: string
  /** Time taken in ms */
  duration?: number
}

/** Callback for OCR status updates */
export type OcrProgressCallback = (status: OcrStatus, progress?: number) => void

// ── Singleton state ──

let workerInstance: any = null
let workerInitPromise: Promise<any> | null = null
let isInitializing = false

// Queue: images waiting for OCR
type QueueItem = {
  file: File
  resolve: (result: OcrResult) => void
  reject: (error: Error) => void
}
const queue: QueueItem[] = []
let isProcessingQueue = false

const OCR_TIMEOUT_MS = 30_000

// ── Helpers ──

/**
 * Convert a File (image) to base64 string (without data URI prefix).
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Remove "data:image/png;base64," prefix
      const base64 = result.split(',')[1] || ''
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Failed to read file as base64'))
    reader.readAsDataURL(file)
  })
}

/**
 * Check if a MIME type is a recognizable image (formats Tesseract supports).
 */
export function isOcrCompatibleImage(mimeType: string): boolean {
  return (
    mimeType === 'image/png' ||
    mimeType === 'image/jpeg' ||
    mimeType === 'image/jpg' ||
    mimeType === 'image/webp' ||
    mimeType === 'image/bmp' ||
    mimeType === 'image/gif'
  )
}

// ── Worker lifecycle ──

/**
 * Get or create the Tesseract worker (lazy init).
 * The worker loads WASM + language data from CDN on first call.
 */
async function getWorker(): Promise<any> {
  if (workerInstance) return workerInstance
  if (workerInitPromise) return workerInitPromise

  workerInitPromise = (async () => {
    const { createWorker } = await import('tesseract.js')
    // chi_sim = Simplified Chinese, eng = English
    // Using LSTM model (OEM 1, default) for best balance of speed and accuracy
    const worker = await createWorker('chi_sim+eng', 1, {
      logger: (info: any) => {
        if (import.meta.env.DEV) {
          // Only log in dev mode to avoid console spam in production
          if (info.status === 'recognizing text') {
            // Progress: info.progress is 0..1
          }
        }
      },
    })
    workerInstance = worker
    return worker
  })()

  try {
    return await workerInitPromise
  } catch (err) {
    // Reset so next attempt can retry
    workerInitPromise = null
    workerInstance = null
    throw err
  }
}

/**
 * Terminate the Tesseract worker and release resources.
 * Called when the app unmounts or after extended idle period.
 */
export async function terminateOcrWorker(): Promise<void> {
  if (workerInstance) {
    await workerInstance.terminate()
    workerInstance = null
    workerInitPromise = null
  }
}

// ── Core OCR ──

/**
 * Perform OCR on a single image file.
 * Returns the recognized text and base64 data.
 */
async function recognizeImage(file: File): Promise<OcrResult> {
  const startTime = Date.now()

  try {
    // Get base64 data in parallel with worker init
    const [base64Data, worker] = await Promise.all([
      fileToBase64(file),
      getWorker(),
    ])

    // Create a timeout race
    const recognizePromise = worker.recognize(file)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('OCR timeout')), OCR_TIMEOUT_MS)
    })

    const result = await Promise.race([recognizePromise, timeoutPromise])

    const text = result?.data?.text?.trim() || ''
    const duration = Date.now() - startTime

    return {
      text,
      base64Data,
      mimeType: file.type || 'image/png',
      status: 'done',
      duration,
    }
  } catch (err) {
    const duration = Date.now() - startTime
    const errorMessage = err instanceof Error ? err.message : String(err)
    const isTimeout = errorMessage === 'OCR timeout'

    // Still try to get base64 even if OCR failed (for Vision API fallback)
    let base64Data = ''
    try {
      base64Data = await fileToBase64(file)
    } catch {
      // Ignore — best effort
    }

    return {
      text: '',
      base64Data,
      mimeType: file.type || 'image/png',
      status: isTimeout ? 'timeout' : 'failed',
      error: errorMessage,
      duration,
    }
  }
}

// ── Queue processor ──

async function processQueue(): Promise<void> {
  if (isProcessingQueue) return
  isProcessingQueue = true

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item) break

    try {
      const result = await recognizeImage(item.file)
      item.resolve(result)
    } catch (err) {
      item.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  isProcessingQueue = false
}

// ── Public API ──

/**
 * Enqueue an image file for OCR processing.
 * Returns a promise that resolves with the OCR result.
 * Images are processed sequentially (one at a time) to manage memory.
 */
export function performOcr(file: File): Promise<OcrResult> {
  if (!isOcrCompatibleImage(file.type)) {
    // Not a supported image — skip OCR, still get base64
    return fileToBase64(file).then((base64Data) => ({
      text: '',
      base64Data,
      mimeType: file.type,
      status: 'idle' as OcrStatus,
    })).catch(() => ({
      text: '',
      base64Data: '',
      mimeType: file.type,
      status: 'failed' as OcrStatus,
      error: 'Failed to read file',
    }))
  }

  return new Promise<OcrResult>((resolve, reject) => {
    queue.push({ file, resolve, reject })
    processQueue()
  })
}

/**
 * Preload the Tesseract worker (call when user indicates intent to use OCR,
 * e.g., when they open the file picker or drag a file).
 * This downloads the WASM + language data ahead of time so recognition
 * starts faster.
 */
export async function preloadOcrWorker(): Promise<void> {
  try {
    await getWorker()
  } catch {
    // Silently fail — will retry on actual OCR request
  }
}
