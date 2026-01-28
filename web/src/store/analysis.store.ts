import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Maximum file information
 */
export interface MaxFile {
  name: string
  size: number
  path: string
}

/**
 * Analysis result
 */
export interface AnalysisResult {
  fileCount: number
  totalSize: number
  averageSize: number
  maxFile: MaxFile | null
  folderCount: number
  duration: number
}

/**
 * Analysis state interface
 */
interface AnalysisState {
  // State
  isAnalyzing: boolean
  progress: number
  fileCount: number
  totalSize: number
  totalFiles?: number // For progress calculation
  currentPath: string | null
  error: string | null
  result: AnalysisResult | null

  // Actions
  startAnalysis: (totalFiles?: number) => void
  updateProgress: (count: number, size: number, path?: string) => void
  completeAnalysis: (result: AnalysisResult) => void
  setError: (error: string) => void
  reset: () => void
}

/**
 * Analysis store with persist middleware
 */
export const useAnalysisStore = create<AnalysisState>()(
  persist(
    (set) => ({
      // Initial state
      isAnalyzing: false,
      progress: 0,
      fileCount: 0,
      totalSize: 0,
      currentPath: null,
      error: null,
      result: null,

      // Actions
      startAnalysis: (totalFiles?: number) =>
        set({
          isAnalyzing: true,
          progress: 0,
          fileCount: 0,
          totalSize: 0,
          totalFiles,
          currentPath: null,
          error: null,
          result: null,
        }),

      updateProgress: (count: number, size: number, path?: string) =>
        set((state) => {
          const newState: Partial<AnalysisState> = {
            fileCount: count,
            totalSize: size,
          }

          // Calculate progress percentage if totalFiles is set
          if (state.totalFiles && state.totalFiles > 0) {
            newState.progress = Math.min(Math.round((count / state.totalFiles) * 100), 100)
          }

          // Update currentPath if provided
          if (path !== undefined) {
            newState.currentPath = path
          }

          return newState as AnalysisState
        }),

      completeAnalysis: (result: AnalysisResult) =>
        set({
          isAnalyzing: false,
          progress: 100,
          result,
          currentPath: null,
        }),

      setError: (error: string) =>
        set({
          isAnalyzing: false,
          error,
        }),

      reset: () =>
        set({
          isAnalyzing: false,
          progress: 0,
          fileCount: 0,
          totalSize: 0,
          totalFiles: undefined,
          currentPath: null,
          error: null,
          result: null,
        }),
    }),
    {
      name: 'analysis-storage', // Local storage key
      partialize: (state) => ({
        // Only persist the result, not the transient state
        result: state.result,
      }),
    }
  )
)
