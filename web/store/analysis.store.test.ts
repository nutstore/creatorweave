import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAnalysisStore } from './analysis.store'

// Mock the WASM loader
vi.mock('@/lib/wasm-loader', () => ({
  loadAnalyzer: vi.fn(() =>
    Promise.resolve({
      add_file: vi.fn(),
      add_files: vi.fn(),
      get_total: () => BigInt(0),
      get_count: () => BigInt(0),
      get_average: () => 0,
      free: vi.fn(),
    })
  ),
}))

describe('AnalysisStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAnalysisStore.setState({
      isAnalyzing: false,
      progress: 0,
      fileCount: 0,
      totalSize: 0,
      currentPath: null,
      error: null,
      result: null,
    })
  })

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = useAnalysisStore.getState()

      expect(state.isAnalyzing).toBe(false)
      expect(state.progress).toBe(0)
      expect(state.fileCount).toBe(0)
      expect(state.totalSize).toBe(0)
      expect(state.currentPath).toBe(null)
      expect(state.error).toBe(null)
      expect(state.result).toBe(null)
    })
  })

  describe('startAnalysis', () => {
    it('should set isAnalyzing to true', () => {
      const { startAnalysis } = useAnalysisStore.getState()

      startAnalysis()

      expect(useAnalysisStore.getState().isAnalyzing).toBe(true)
    })

    it('should reset progress and stats', () => {
      useAnalysisStore.setState({
        progress: 50,
        fileCount: 100,
        totalSize: 1000,
      })

      const { startAnalysis } = useAnalysisStore.getState()
      startAnalysis()

      expect(useAnalysisStore.getState().progress).toBe(0)
      expect(useAnalysisStore.getState().fileCount).toBe(0)
      expect(useAnalysisStore.getState().totalSize).toBe(0)
    })

    it('should clear previous errors and results', () => {
      useAnalysisStore.setState({
        error: 'Previous error',
        result: {
          fileCount: 100,
          totalSize: 1000,
          averageSize: 10,
          maxFile: null,
          folderCount: 0,
          duration: 1000,
        } as any,
      })

      const { startAnalysis } = useAnalysisStore.getState()
      startAnalysis()

      expect(useAnalysisStore.getState().error).toBe(null)
      expect(useAnalysisStore.getState().result).toBe(null)
    })
  })

  describe('updateProgress', () => {
    it('should update progress, fileCount, and totalSize', () => {
      const { updateProgress } = useAnalysisStore.getState()

      updateProgress(100, 1000)

      const state = useAnalysisStore.getState()
      expect(state.fileCount).toBe(100)
      expect(state.totalSize).toBe(1000)
    })

    it('should update currentPath when provided', () => {
      const { updateProgress } = useAnalysisStore.getState()

      updateProgress(100, 1000, '/path/to/file')

      expect(useAnalysisStore.getState().currentPath).toBe('/path/to/file')
    })

    it('should not update currentPath when not provided', () => {
      useAnalysisStore.setState({ currentPath: '/existing/path' })

      const { updateProgress } = useAnalysisStore.getState()
      updateProgress(100, 1000)

      expect(useAnalysisStore.getState().currentPath).toBe('/existing/path')
    })

    it('should calculate progress percentage correctly when totalFiles is set', () => {
      useAnalysisStore.setState({ totalFiles: 200 })

      const { updateProgress } = useAnalysisStore.getState()
      updateProgress(100, 1000)

      expect(useAnalysisStore.getState().progress).toBe(50)
    })
  })

  describe('completeAnalysis', () => {
    it('should set isAnalyzing to false', () => {
      useAnalysisStore.setState({ isAnalyzing: true })

      const { completeAnalysis } = useAnalysisStore.getState()
      completeAnalysis({
        fileCount: 100,
        totalSize: 1000,
        averageSize: 10,
        maxFile: null,
        folderCount: 5,
        duration: 2000,
      })

      expect(useAnalysisStore.getState().isAnalyzing).toBe(false)
    })

    it('should set the result', () => {
      const result = {
        fileCount: 100,
        totalSize: 1000,
        averageSize: 10,
        maxFile: {
          name: 'large-file.jpg',
          size: 500,
          path: '/path/to/large-file.jpg',
        },
        folderCount: 5,
        duration: 2000,
      }

      const { completeAnalysis } = useAnalysisStore.getState()
      completeAnalysis(result)

      expect(useAnalysisStore.getState().result).toEqual(result)
    })

    it('should set progress to 100', () => {
      const { completeAnalysis } = useAnalysisStore.getState()
      completeAnalysis({
        fileCount: 100,
        totalSize: 1000,
        averageSize: 10,
        maxFile: null,
        folderCount: 5,
        duration: 2000,
      })

      expect(useAnalysisStore.getState().progress).toBe(100)
    })

    it('should clear currentPath', () => {
      useAnalysisStore.setState({ currentPath: '/some/path' })

      const { completeAnalysis } = useAnalysisStore.getState()
      completeAnalysis({
        fileCount: 100,
        totalSize: 1000,
        averageSize: 10,
        maxFile: null,
        folderCount: 5,
        duration: 2000,
      })

      expect(useAnalysisStore.getState().currentPath).toBe(null)
    })
  })

  describe('setError', () => {
    it('should set error message', () => {
      const { setError } = useAnalysisStore.getState()
      setError('Something went wrong')

      expect(useAnalysisStore.getState().error).toBe('Something went wrong')
    })

    it('should set isAnalyzing to false', () => {
      useAnalysisStore.setState({ isAnalyzing: true })

      const { setError } = useAnalysisStore.getState()
      setError('Error')

      expect(useAnalysisStore.getState().isAnalyzing).toBe(false)
    })
  })

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      useAnalysisStore.setState({
        isAnalyzing: true,
        progress: 75,
        fileCount: 100,
        totalSize: 1000,
        currentPath: '/some/path',
        error: 'Some error',
        result: {} as any,
      })

      const { reset } = useAnalysisStore.getState()
      reset()

      const state = useAnalysisStore.getState()
      expect(state.isAnalyzing).toBe(false)
      expect(state.progress).toBe(0)
      expect(state.fileCount).toBe(0)
      expect(state.totalSize).toBe(0)
      expect(state.currentPath).toBe(null)
      expect(state.error).toBe(null)
      expect(state.result).toBe(null)
    })
  })
})
