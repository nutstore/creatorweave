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
 * Analyze files using WASM analyzer
 * @param files - Array of file metadata
 * @param progressCallback - Optional progress callback
 * @returns Analysis result
 */
export async function analyzeFiles(
  files: FileMetadata[],
  progressCallback?: ProgressCallback
): Promise<AnalysisResult> {
  const startTime = performance.now()
  const analyzer = await loadAnalyzer()

  let maxFile: MaxFile | null = null
  let folderCount = 0

  // Batch size for processing files (reduced to avoid WASM memory issues)
  const batchSize = 50

  try {
    // Process files in batches
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)

      // Prepare sizes array for WASM
      const sizes = new BigUint64Array(batch.map((f) => BigInt(f.size)))

      // Add batch to analyzer
      analyzer.add_files(sizes)

      // Track max file
      for (const file of batch) {
        if (!maxFile || file.size > maxFile.size) {
          maxFile = {
            name: file.name,
            size: file.size,
            path: file.path,
          }
        }
      }

      // Count directories
      for (const file of batch) {
        if (file.type === 'directory') {
          folderCount++
        }
      }

      // Report progress
      if (progressCallback) {
        const totalSize = Number(analyzer.get_total())
        progressCallback(i + batch.length, totalSize, batch[batch.length - 1]?.path)
      }
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
  } finally {
    // Clean up
    analyzer.free()
  }
}
