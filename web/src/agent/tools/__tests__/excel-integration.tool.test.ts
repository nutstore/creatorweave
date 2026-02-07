/**
 * Tests for Excel Integration Tool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  read_excel_executor,
  analyze_excel_executor,
  export_to_csv_executor,
  query_excel_executor,
} from '../excel-integration.tool'
import type { ToolContext } from '../tool-types'

// Mock OPFS store
const mockReadFile = vi.fn()
const mockWriteFile = vi.fn()

// Mock the store module
vi.mock('@/store/opfs.store', () => ({
  useOPFSStore: {
    getState: vi.fn(() => ({
      readFile: mockReadFile,
      writeFile: mockWriteFile,
    })),
  },
}))

describe('Excel Integration Tool', () => {
  let mockContext: ToolContext

  beforeEach(() => {
    vi.clearAllMocks()
    mockContext = {
      directoryHandle: {} as FileSystemDirectoryHandle,
    }
  })

  describe('read_excel', () => {
    it('should read a CSV file', async () => {
      const csvContent = 'Name,Age,City\nAlice,30,NYC\nBob,25,LA'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })

      const args = {
        file_path: 'data.csv',
      }

      const result = JSON.parse(await read_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.worksheets).toContain('Sheet1')
      expect(result.data['Sheet1']).toBeDefined()
      expect(result.data['Sheet1'].length).toBe(3) // header + 2 rows
    })

    it('should parse CSV with quotes', async () => {
      const csvContent = 'Name,Description\n"Test, User","A description with, commas"'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })

      const args = {
        file_path: 'quoted.csv',
      }

      const result = JSON.parse(await read_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.data['Sheet1'][0]).toEqual(['Name', 'Description'])
      expect(result.data['Sheet1'][1][0]).toBe('Test, User')
    })

    it('should respect header_row parameter', async () => {
      const csvContent = 'Name,Age\nAlice,30\nBob,25'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })

      const args = {
        file_path: 'data.csv',
        header_row: 1,
      }

      const result = JSON.parse(await read_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      // When header_row is specified, data should be objects
      expect(result.data['Sheet1']).toBeInstanceOf(Array)
      if (result.data['Sheet1'].length > 0) {
        expect(result.data['Sheet1'][0]).toHaveProperty('Name')
        expect(result.data['Sheet1'][0]).toHaveProperty('Age')
      }
    })

    it('should limit rows with max_rows', async () => {
      const csvContent = 'Name,Age\nAlice,30\nBob,25\nCharlie,35\nDavid,40'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })

      const args = {
        file_path: 'data.csv',
        max_rows: 2,
      }

      const result = JSON.parse(await read_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.data['Sheet1'].length).toBeLessThanOrEqual(2)
    })

    it('should handle file not found', async () => {
      mockReadFile.mockResolvedValue({
        content: null,
        metadata: null,
      })

      const args = {
        file_path: 'nonexistent.csv',
      }

      const result = JSON.parse(await read_excel_executor(args, mockContext))

      expect(result.success).toBe(false)
    })
  })

  describe('analyze_excel', () => {
    it('should analyze CSV data', async () => {
      const csvContent = 'Name,Age,City\nAlice,30,NYC\nBob,25,LA\nCharlie,35,SF'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })

      const args = {
        file_path: 'data.csv',
      }

      const result = JSON.parse(await analyze_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis).toBeDefined()
      expect(result.analysis.totalRows).toBe(4)
      expect(result.analysis.totalColumns).toBe(3)
    })

    it('should include column statistics', async () => {
      const csvContent = 'Name,Age\nAlice,30\nBob,25\nCharlie,35'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })

      const args = {
        file_path: 'data.csv',
        include_column_stats: true,
      }

      const result = JSON.parse(await analyze_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis.columnStats).toBeDefined()
      expect(result.analysis.columnStats!.length).toBeGreaterThan(0)
    })

    it('should detect data types', async () => {
      const csvContent = 'Name,Age,Active\nAlice,30,true\nBob,25,false'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })

      const args = {
        file_path: 'data.csv',
      }

      const result = JSON.parse(await analyze_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis.dataTypes).toBeDefined()
      expect(result.analysis.dataTypes.number).toBeGreaterThan(0)
    })

    it('should handle empty rows', async () => {
      const csvContent = 'Name,Age\nAlice,30\n\nBob,25'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })

      const args = {
        file_path: 'data.csv',
      }

      const result = JSON.parse(await analyze_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.analysis.emptyCells).toBeGreaterThan(0)
    })
  })

  describe('export_to_csv', () => {
    it('should convert Excel to CSV', async () => {
      const csvContent = 'Name,Age\nAlice,30\nBob,25'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })
      mockWriteFile.mockResolvedValue(undefined)

      const args = {
        file_path: 'data.csv',
        output_path: 'output.csv',
      }

      const result = JSON.parse(await export_to_csv_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.output_file).toBe('output.csv')
      expect(mockWriteFile).toHaveBeenCalledWith(
        'output.csv',
        expect.any(String),
        mockContext.directoryHandle
      )
    })

    it('should use custom delimiter', async () => {
      const csvContent = 'Name,Age\nAlice,30\nBob,25'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })
      mockWriteFile.mockResolvedValue(undefined)

      const args = {
        file_path: 'data.csv',
        delimiter: ';',
      }

      const result = JSON.parse(await export_to_csv_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.delimiter).toBe(';')
    })

    it('should escape quotes in CSV output', async () => {
      const csvContent = 'Name,Description\n"Test, User","Hello, World"'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })
      mockWriteFile.mockResolvedValue(undefined)

      const args = {
        file_path: 'data.csv',
      }

      await export_to_csv_executor(args, mockContext)

      const writtenContent = mockWriteFile.mock.calls[0][1] as string
      expect(writtenContent).toContain('"Test, User"')
    })
  })

  describe('query_excel', () => {
    beforeEach(() => {
      const csvContent = 'Name,Value\nAlice,10\nBob,20\nCharlie,30\nDavid,40\nEve,50'
      mockReadFile.mockResolvedValue({
        content: csvContent,
        metadata: { size: 100, mtime: Date.now() },
      })
    })

    it('should filter rows with equals condition', async () => {
      const args = {
        file_path: 'data.csv',
        filters: [{ column: 0, operator: 'equals', value: 'Alice' }],
      }

      const result = JSON.parse(await query_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.returned_rows).toBe(1) // Only Alice
    })

    it('should filter rows with contains condition', async () => {
      const args = {
        file_path: 'data.csv',
        filters: [{ column: 0, operator: 'contains', value: 'a' }],
      }

      const result = JSON.parse(await query_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.returned_rows).toBeGreaterThan(0)
    })

    it('should filter rows with greater condition', async () => {
      const args = {
        file_path: 'data.csv',
        filters: [{ column: 1, operator: 'greater', value: '25' }],
      }

      const result = JSON.parse(await query_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.returned_rows).toBe(3) // 30, 40, 50
    })

    it('should respect limit parameter', async () => {
      const args = {
        file_path: 'data.csv',
        limit: 3,
      }

      const result = JSON.parse(await query_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.returned_rows).toBeLessThanOrEqual(3)
    })

    it('should handle multiple filters', async () => {
      const args = {
        file_path: 'data.csv',
        filters: [
          { column: 0, operator: 'equals', value: 'Alice' },
          { column: 1, operator: 'equals', value: '10' },
        ],
      }

      const result = JSON.parse(await query_excel_executor(args, mockContext))

      expect(result.success).toBe(true)
      expect(result.returned_rows).toBe(1) // Only Alice,10 matches both
    })
  })
})
