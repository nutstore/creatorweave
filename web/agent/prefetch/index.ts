/**
 * Prefetch Module - Predictive file loading system.
 *
 * This module coordinates:
 * 1. File prediction based on conversation context
 * 2. Background prefetching with OPFS cache integration
 * 3. Statistics tracking and cache management
 *
 * Integration with AgentLoop:
 * - Call `triggerPrefetch()` after each user message
 * - Predictions are automatically cached in OPFS
 * - Subsequent file_read calls will hit the cache
 */

// Types
export type { FilePrediction, PredictionContext } from './file-predictor'
export type { PrefetchTask, PrefetchPriority, PrefetchStats } from './prefetch-cache'

// Core
export { FilePredictor, getFilePredictor } from './file-predictor'
export { PrefetchCache, getPrefetchCache, prefetchFiles } from './prefetch-cache'

//=============================================================================
// High-Level API
//=============================================================================

import { getFilePredictor } from './file-predictor'
import { getPrefetchCache } from './prefetch-cache'
import type { FilePrediction } from './file-predictor'

/**
 * Trigger prefetch based on conversation context
 * This is the main entry point for integration with AgentLoop
 *
 * @param context - Prediction context with recent messages and file handles
 * @returns Predictions that were added to prefetch queue
 */
export async function triggerPrefetch(context: {
  directoryHandle?: FileSystemDirectoryHandle | null
  recentMessages: string[]
  recentFiles: string[]
  projectType?: string
  activeFile?: string
  sessionId?: string
}): Promise<FilePrediction[]> {
  // Get predictions
  const predictor = getFilePredictor()
  const predictions = await predictor.predictWithCache({
    directoryHandle: context.directoryHandle,
    recentMessages: context.recentMessages,
    recentFiles: context.recentFiles,
    projectType: context.projectType,
    activeFile: context.activeFile,
  })

  // Filter to only high/medium confidence predictions
  const relevantPredictions = predictions.filter((p) => p.confidence >= 0.3)

  if (relevantPredictions.length === 0) {
    return []
  }

  // Initialize and prefetch
  const cache = getPrefetchCache()
  await cache.initialize(context.directoryHandle, context.sessionId)
  await cache.prefetch(relevantPredictions)

  console.log(
    `[Prefetch] Triggered prefetch for ${relevantPredictions.length} files`,
    relevantPredictions.map((p) => `${p.path} (${p.confidence.toFixed(2)})`)
  )

  return relevantPredictions
}

/**
 * Get current prefetch statistics
 */
export function getPrefetchStatistics() {
  const cache = getPrefetchCache()
  return cache.getStats()
}

/**
 * Check if a file is prefetched
 */
export function isFilePrefetched(path: string): boolean {
  const cache = getPrefetchCache()
  return cache.isCached(path)
}

/**
 * Get prefetch status for a file
 */
export function getPrefetchStatus(path: string) {
  const cache = getPrefetchCache()
  return cache.getStatus(path)
}

/**
 * Clear all prefetch data
 */
export function clearPrefetchCache(): void {
  const predictor = getFilePredictor()
  const cache = getPrefetchCache()

  predictor.clearCache()
  cache.clear()

  console.log('[Prefetch] Cache cleared')
}
