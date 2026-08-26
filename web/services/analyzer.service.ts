import { loadAnalyzer } from '@/lib/wasm-loader'
import type { FileMetadata } from './traversal.service'
import type { AnalysisResult, MaxFile } from '@/store/analysis.store'

/**
 * Progress callback type
 */
export type ProgressCallback = (count: number, size: number, path?: string) => void

/**
 * Configuration for analyzer
 */
export interface AnalyzerConfig {
  batchSize?: number
  progressCallback?: ProgressCallback
}

/**
 * Analyze files using WASM analyzer with streaming processing
 *
 * Processes files in batches as they arrive from the async generator,
 * avoiding the need to load all file metadata into memory at once.
 *
 * @param fileGenerator - Async generator that yields file metadata
 * @param progressCallback - Optional progress callback
 * @returns Analysis result
 */
export async function analyzeFiles(
  fileGenerator: AsyncGenerator<FileMetadata>,
  progressCallback?: ProgressCallback
): Promise<AnalysisResult> {
  const startTime = performance.now()
  const analyzer = await loadAnalyzer()

  let maxFile: MaxFile | null = null
  let folderCount = 0
  let totalCount = 0

  // Batch size for processing files
  const batchSize = 50

  // Buffer for collecting a batch of file sizes
  let batchBuffer: bigint[] = []
  let batchFiles: FileMetadata[] = []

  // Reset analyzer state for new analysis
  analyzer.reset()

  // Process files as they arrive from the generator
  for await (const file of fileGenerator) {
    batchBuffer.push(BigInt(file.size))
    batchFiles.push(file)
    totalCount++

    // Track max file and count directories
    if (!maxFile || file.size > maxFile.size) {
      maxFile = {
        name: file.name,
        size: file.size,
        path: file.path,
      }
    }

    if (file.type === 'directory') {
      folderCount++
    }

    // When batch is full, send to WASM
    if (batchBuffer.length >= batchSize) {
      const sizes = new BigUint64Array(batchBuffer)
      analyzer.add_files(sizes)

      // Clear buffer
      batchBuffer = []
      batchFiles = []

      // Report progress
      if (progressCallback) {
        const totalSize = Number(analyzer.get_total())
        progressCallback(totalCount, totalSize, file.path)
      }
    }
  }

  // Process remaining files in the buffer
  if (batchBuffer.length > 0) {
    const sizes = new BigUint64Array(batchBuffer)
    analyzer.add_files(sizes)
  }

  // Get final results
  const totalSize = Number(analyzer.get_total())
  const fileCount = Number(analyzer.get_count())
  const averageSize = analyzer.get_average()
  const duration = performance.now() - startTime

  return {
    fileCount,
    totalSize,
    averageSize,
    maxFile,
    folderCount,
    duration: Math.round(duration),
  }
}

/**
 * Legacy interface for backward compatibility
 * Takes an array and converts it to an async generator
 *
 * @deprecated Use the async generator version instead
 */
export async function analyzeFilesArray(
  files: FileMetadata[],
  progressCallback?: ProgressCallback
): Promise<AnalysisResult> {
  async function* arrayToGenerator(): AsyncGenerator<FileMetadata> {
    for (const file of files) {
      yield file
    }
  }

  return analyzeFiles(arrayToGenerator(), progressCallback)
}
