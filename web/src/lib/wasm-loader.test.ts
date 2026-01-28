import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadAnalyzer, resetCachedAnalyzer } from './wasm-loader'

// Mock the WASM module
const mockFileAnalyzer = {
  add_file: vi.fn(),
  add_files: vi.fn(),
  get_total: vi.fn(),
  get_count: vi.fn(),
  get_average: vi.fn(),
  free: vi.fn(),
  [Symbol.dispose]: vi.fn(),
}

vi.mock('@wasm/browser_fs_analyzer_wasm.js', () => ({
  FileAnalyzer: vi.fn(() => mockFileAnalyzer),
}))

describe('wasm-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCachedAnalyzer()
  })

  it('should load and initialize FileAnalyzer', async () => {
    const { FileAnalyzer } = await import('@wasm/browser_fs_analyzer_wasm.js')
    const analyzer = await loadAnalyzer()

    expect(analyzer).toBeDefined()
    expect(FileAnalyzer).toHaveBeenCalledOnce()
  })

  it('should return analyzer with all required methods', async () => {
    const analyzer = await loadAnalyzer()

    expect(typeof analyzer.add_file).toBe('function')
    expect(typeof analyzer.add_files).toBe('function')
    expect(typeof analyzer.get_total).toBe('function')
    expect(typeof analyzer.get_count).toBe('function')
    expect(typeof analyzer.get_average).toBe('function')
    expect(typeof analyzer.free).toBe('function')
  })

  it('should cache the loaded analyzer instance', async () => {
    const { FileAnalyzer } = await import('@wasm/browser_fs_analyzer_wasm.js')
    const analyzer1 = await loadAnalyzer()
    const analyzer2 = await loadAnalyzer()

    // Should return the same instance
    expect(analyzer1).toBe(analyzer2)
    expect(FileAnalyzer).toHaveBeenCalledOnce()
  })
})
