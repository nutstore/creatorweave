/**
 * Tests for data analysis tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  analyzeDataExecutor,
  generateChartExecutor,
  filterDataExecutor,
  aggregateDataExecutor,
} from '../data-analysis.tool'
import type { ToolContext } from '../tool-types'

// Mock directory handle
const mockDirectoryHandle = {
  getFileHandle: vi.fn(),
  getDirectoryHandle: vi.fn(),
} as unknown as FileSystemDirectoryHandle

const mockContext: ToolContext = {
  directoryHandle: mockDirectoryHandle,
  abortSignal: undefined,
}

// Mock file handle
const createMockFileHandle = (content: string) =>
  ({
    kind: 'file',
    name: 'test.csv',
    getFile: vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue(content),
    }),
  }) as unknown as FileSystemFileHandle

describe('analyze_data tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should analyze CSV data', async () => {
    const csvData = `name,age,city
John,30,New York
Jane,25,Los Angeles
Bob,35,Chicago`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await analyzeDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.summary.totalRows).toBe(3)
    expect(parsed.summary.totalColumns).toBe(3)
    expect(parsed.statistics.name.count).toBe(3)
    expect(parsed.statistics.age.min).toBe(25)
    expect(parsed.statistics.age.max).toBe(35)
  })

  it('should analyze JSON data', async () => {
    const jsonData = JSON.stringify([
      { name: 'John', age: 30 },
      { name: 'Jane', age: 25 },
      { name: 'Bob', age: 35 },
    ])

    const mockFileHandle = createMockFileHandle(jsonData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await analyzeDataExecutor(
      {
        path: 'test.json',
        file_type: 'json',
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.summary.totalRows).toBe(3)
    expect(parsed.summary.totalColumns).toBe(2)
    expect(parsed.statistics.age.avg).toBeCloseTo(30)
  })

  it('should return error when no directory selected', async () => {
    const result = await analyzeDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
      },
      { directoryHandle: null }
    )

    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('No directory selected')
  })
})

describe('generate_chart tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should generate bar chart data', async () => {
    const csvData = `category,value
A,10
B,20
C,30`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await generateChartExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        chart_type: 'bar',
        x_axis: 'category',
        y_axis: 'value',
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.chartType).toBe('bar')
    expect(parsed.data).toHaveLength(3)
    expect(parsed.data[0]).toMatchObject({ label: 'C', value: 30 })
    expect(parsed.visualization).toBeDefined()
  })

  it('should generate line chart data', async () => {
    const csvData = `month,value
Jan,10
Feb,20
Mar,30`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await generateChartExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        chart_type: 'line',
        x_axis: 'month',
        y_axis: 'value',
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.chartType).toBe('line')
    expect(parsed.data).toHaveLength(3)
  })

  it('should generate pie chart data', async () => {
    const csvData = `category,value
A,30
B,20
C,10`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await generateChartExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        chart_type: 'pie',
        x_axis: 'category',
        y_axis: 'value',
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.chartType).toBe('pie')
    expect(parsed.data).toHaveLength(3)
  })

  it('should generate scatter chart data', async () => {
    const csvData = `x,y
1,10
2,20
3,30`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await generateChartExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        chart_type: 'scatter',
        x_axis: 'x',
        y_axis: 'y',
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.chartType).toBe('scatter')
    expect(parsed.data[0]).toMatchObject({ x: 1, y: 10 })
  })

  it('should return error for invalid column', async () => {
    const csvData = `category,value
A,10
B,20`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await generateChartExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        chart_type: 'bar',
        x_axis: 'invalid_column',
        y_axis: 'value',
      },
      mockContext
    )

    const parsed = JSON.parse(result)
    expect(parsed.error).toContain('not found in data')
  })
})

describe('filter_data tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should filter data by equality', async () => {
    const csvData = `name,age,city
John,30,NYC
Jane,25,LA
Bob,35,NYC`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await filterDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        filters: [{ column: 'city', operator: 'eq', value: 'NYC' }],
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.filteredRows).toBe(2)
    expect(parsed.data[0].name).toBe('John')
    expect(parsed.data[1].name).toBe('Bob')
  })

  it('should filter data by greater than', async () => {
    const csvData = `name,age
John,30
Jane,25
Bob,35`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await filterDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        filters: [{ column: 'age', operator: 'gt', value: 30 }],
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.filteredRows).toBe(1)
    expect(parsed.data[0].name).toBe('Bob')
  })

  it('should apply multiple filters', async () => {
    const csvData = `name,age,city
John,30,NYC
Jane,25,LA
Bob,35,NYC`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await filterDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        filters: [
          { column: 'city', operator: 'eq', value: 'NYC' },
          { column: 'age', operator: 'gt', value: 30 },
        ],
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.filteredRows).toBe(1)
    expect(parsed.data[0].name).toBe('Bob')
  })

  it('should export filtered data as CSV', async () => {
    const csvData = `name,age
John,30
Jane,25
Bob,35`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await filterDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        filters: [{ column: 'age', operator: 'gt', value: 25 }],
        export_format: 'csv',
      },
      mockContext
    )

    expect(result).toContain('name,age')
    expect(result).toContain('John,30')
    expect(result).toContain('Bob,35')
  })
})

describe('aggregate_data tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should aggregate data with count', async () => {
    const csvData = `category,value
A,10
A,20
B,30`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await aggregateDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        group_by: 'category',
        aggregations: { value: 'count' },
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.groupCount).toBe(2)
    expect(parsed.data[0]).toMatchObject({ category: 'A', value: 2 })
    expect(parsed.data[1]).toMatchObject({ category: 'B', value: 1 })
  })

  it('should aggregate data with sum', async () => {
    const csvData = `category,value
A,10
A,20
B,30`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await aggregateDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        group_by: 'category',
        aggregations: { value: 'sum' },
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.data[0]).toMatchObject({ category: 'A', value: 30 })
    expect(parsed.data[1]).toMatchObject({ category: 'B', value: 30 })
  })

  it('should aggregate data with avg', async () => {
    const csvData = `category,value
A,10
A,20
B,30`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await aggregateDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        group_by: 'category',
        aggregations: { value: 'avg' },
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.data[0].value).toBe(15)
    expect(parsed.data[1].value).toBe(30)
  })

  it('should aggregate with multiple aggregations', async () => {
    const csvData = `category,value
A,10
A,20
B,30`

    const mockFileHandle = createMockFileHandle(csvData)
    vi.spyOn(mockDirectoryHandle, 'getFileHandle').mockResolvedValue(mockFileHandle)

    const result = await aggregateDataExecutor(
      {
        path: 'test.csv',
        file_type: 'csv',
        group_by: 'category',
        aggregations: {
          value_sum: 'sum',
          value_avg: 'avg',
          value_count: 'count',
        },
      },
      mockContext
    )

    const parsed = JSON.parse(result)

    expect(parsed.data[0].value_sum).toBe(30)
    expect(parsed.data[0].value_avg).toBe(15)
    expect(parsed.data[0].value_count).toBe(2)
  })
})
