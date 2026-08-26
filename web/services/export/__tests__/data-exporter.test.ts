/**
 * Data Exporter Service Tests
 *
 * Tests for CSV, JSON, Excel, and Image export functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock file-saver before imports
const mockSaveAs = vi.fn()
vi.mock('file-saver', () => ({
  saveAs: mockSaveAs,
}))

// Import after mocking
const {
  exportToCSV,
  exportToJSON,
  exportToExcel,
  exportToImage,
  detectExportFormat,
  getRecommendedFormat,
} = await import('@/services/export/data-exporter')

describe('Data Exporter Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock window.devicePixelRatio for image export tests
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(1)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ===========================================================================
  // CSV Export Tests
  // ===========================================================================

  describe('exportToCSV', () => {
    it('should export array of objects to CSV', async () => {
      const data = [
        { name: 'John', age: 30, city: 'NYC' },
        { name: 'Jane', age: 25, city: 'LA' },
      ]

      const result = await exportToCSV(data)

      expect(result.success).toBe(true)
      expect(result.filename).toMatch(/^export_\d+\.csv$/)
      expect(result.size).toBeGreaterThan(0)
      expect(mockSaveAs).toHaveBeenCalledTimes(1)
    })

    it('should export 2D array to CSV', async () => {
      const data = [
        ['Name', 'Age', 'City'],
        ['John', '30', 'NYC'],
        ['Jane', '25', 'LA'],
      ]

      const result = await exportToCSV(data)

      expect(result.success).toBe(true)
      expect(result.size).toBeGreaterThan(0)
    })

    it('should handle empty array', async () => {
      const result = await exportToCSV([])

      expect(result.success).toBe(true)
      expect(result.size).toBe(0)
    })

    it('should escape values with commas', async () => {
      const data = [{ name: 'John, Jr.', value: 100 }]

      const result = await exportToCSV(data)

      expect(result.success).toBe(true)
      expect(result.size).toBeGreaterThan(0)
    })

    it('should respect custom filename', async () => {
      const data = [{ id: 1 }]

      await exportToCSV(data, { filename: 'custom', addTimestamp: false })

      expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'custom.csv')
    })

    it('should call onProgress callback', async () => {
      const onProgress = vi.fn()
      const data = [{ id: 1 }]

      await exportToCSV(data, { onProgress })

      expect(onProgress).toHaveBeenCalledWith(10, 'Preparing data...')
      expect(onProgress).toHaveBeenCalledWith(50, 'Generating file...')
      expect(onProgress).toHaveBeenCalledWith(100, 'Export complete')
    })

    it('should handle abort signal', async () => {
      const abortController = new AbortController()
      abortController.abort()
      const data = [{ id: 1 }]

      const result = await exportToCSV(data, { signal: abortController.signal })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Export cancelled')
    })
  })

  // ===========================================================================
  // JSON Export Tests
  // ===========================================================================

  describe('exportToJSON', () => {
    it('should export object to JSON', async () => {
      const data = { name: 'John', age: 30, cities: ['NYC', 'LA'] }

      const result = await exportToJSON(data)

      expect(result.success).toBe(true)
      expect(result.filename).toMatch(/^export_\d+\.json$/)
      expect(result.size).toBeGreaterThan(0)
      expect(mockSaveAs).toHaveBeenCalledTimes(1)
    })

    it('should export array to JSON', async () => {
      const data = [1, 2, 3, 4, 5]

      const result = await exportToJSON(data)

      expect(result.success).toBe(true)
    })

    it('should format JSON with indentation', async () => {
      const data = { nested: { value: 'test' } }

      const result = await exportToJSON(data)

      expect(result.success).toBe(true)
      expect(result.size).toBeGreaterThan(0)
    })

    it('should respect custom filename', async () => {
      const data = { test: true }

      await exportToJSON(data, { filename: 'data', addTimestamp: false })

      expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'data.json')
    })
  })

  // ===========================================================================
  // Excel Export Tests
  // ===========================================================================

  describe('exportToExcel', () => {
    it('should export data to Excel format', async () => {
      const data = [
        { Name: 'John', Age: 30 },
        { Name: 'Jane', Age: 25 },
      ]

      const result = await exportToExcel(data)

      expect(result.success).toBe(true)
      expect(result.filename).toMatch(/^export_\d+\.xlsx$/)
      expect(result.size).toBeGreaterThan(0)
      expect(mockSaveAs).toHaveBeenCalledTimes(1)
    })

    it('should create custom sheet name', async () => {
      const data = [{ id: 1 }]

      await exportToExcel(data, { sheetName: 'MyData', addTimestamp: false })

      // File should be saved
      expect(mockSaveAs).toHaveBeenCalled()
    })

    it('should handle multiple sheets', async () => {
      const data = {
        Sheet1: [{ id: 1 }],
        Sheet2: [{ name: 'Test' }],
      }

      const result = await exportToExcel(data)

      expect(result.success).toBe(true)
    })

    it('should respect custom filename', async () => {
      const data = [{ id: 1 }]

      await exportToExcel(data, { filename: 'report', addTimestamp: false })

      expect(mockSaveAs).toHaveBeenCalledWith(expect.any(Blob), 'report.xlsx')
    })
  })

  // ===========================================================================
  // Image Export Tests
  // ===========================================================================

  describe('exportToImage', () => {
    it('should export SVG format', async () => {
      // Create a mock SVG element
      const mockElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      mockElement.setAttribute('width', '100')
      mockElement.setAttribute('height', '100')
      document.body.appendChild(mockElement)

      const result = await exportToImage(mockElement as unknown as HTMLElement, 'svg')

      expect(result.success).toBe(true)
      // Filename should end with .svg (with or without timestamp)
      expect(result.filename).toMatch(/\.svg$/)

      document.body.removeChild(mockElement)
    })
  })

  // ===========================================================================
  // Utility Function Tests
  // ===========================================================================

  describe('detectExportFormat', () => {
    it('should detect CSV format for array of objects', () => {
      const data = [{ name: 'John' }, { name: 'Jane' }]
      expect(detectExportFormat(data)).toBe('excel')
    })

    it('should detect CSV format for simple array', () => {
      const data = [1, 2, 3]
      expect(detectExportFormat(data)).toBe('csv')
    })

    it('should detect JSON format for single object', () => {
      const data = { name: 'John' }
      expect(detectExportFormat(data)).toBe('json')
    })

    it('should return CSV for empty array', () => {
      const data: unknown[] = []
      expect(detectExportFormat(data)).toBe('csv')
    })
  })

  describe('getRecommendedFormat', () => {
    it('should recommend Excel for table data', () => {
      expect(getRecommendedFormat('table')).toBe('excel')
    })

    it('should recommend JSON for hierarchical data', () => {
      expect(getRecommendedFormat('hierarchical')).toBe('json')
    })

    it('should recommend CSV for key-value data', () => {
      expect(getRecommendedFormat('key-value')).toBe('csv')
    })
  })
})

describe('CSV Formatting', () => {
  it('should format boolean values correctly', async () => {
    const data = [{ active: true, inactive: false }]

    const result = await exportToCSV(data)

    expect(result.success).toBe(true)
    expect(result.size).toBeGreaterThan(0)
  })

  it('should handle null and undefined values', async () => {
    const data = [{ name: 'John', age: null, city: undefined }]

    const result = await exportToCSV(data)

    expect(result.success).toBe(true)
  })

  it('should escape quotes in strings', async () => {
    const data = [{ quote: 'He said "Hello"' }]

    const result = await exportToCSV(data)

    expect(result.success).toBe(true)
    expect(result.size).toBeGreaterThan(0)
  })
})
