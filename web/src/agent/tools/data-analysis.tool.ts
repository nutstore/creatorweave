/**
 * Data Analysis Tools
 *
 * Provides tools for analyzing and visualizing CSV/JSON data:
 * - analyze_data: Extract insights from data files
 * - generate_chart: Create chart configuration from data
 * - filter_data: Apply filters to data
 * - aggregate_data: Group and aggregate data
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'
import { resolveNativeDirectoryHandle } from './tool-utils'
import {
  parseCSV,
  parseJSON,
  calculateAllStats,
  filterData,
  aggregateData,
  exportToCSV,
  type ParsedData,
  type DataStats,
} from '@/utils/data-parsing'

//=============================================================================
// analyze_data Tool
//=============================================================================

export const analyzeDataDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'analyze_data',
    description:
      'Analyze a CSV or JSON data file and extract insights including statistics, column types, and data quality metrics.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the data file (relative to project root)',
        },
        file_type: {
          type: 'string',
          enum: ['csv', 'json'],
          description: 'Type of data file',
        },
      },
      required: ['path', 'file_type'],
    },
  },
}

export const analyzeDataExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<string> => {
  const path = args.path as string
  const fileType = args.file_type as 'csv' | 'json'

  const directoryHandle = await resolveNativeDirectoryHandle(context.directoryHandle, context.workspaceId)
  if (!directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a folder first.' })
  }

  try {
    // Read file content
    let fileContent: string
    try {
      const fileHandle = await getFileHandle(directoryHandle, path)
      const file = await fileHandle.getFile()
      fileContent = await file.text()
    } catch (error) {
      return JSON.stringify({
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }

    // Parse data
    let parsedData: ParsedData
    try {
      if (fileType === 'csv') {
        parsedData = parseCSV(fileContent)
      } else {
        parsedData = parseJSON(fileContent)
      }
    } catch (error) {
      return JSON.stringify({
        error: `Failed to parse data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }

    // Calculate statistics
    const stats = calculateAllStats(parsedData)

    // Build analysis result
    const analysis = {
      summary: {
        totalRows: parsedData.rowCount,
        totalColumns: parsedData.columnCount,
        columnTypes: parsedData.columns.map((col) => ({
          name: col.name,
          type: col.type,
          nullable: col.nullable,
          uniqueValues: col.unique,
        })),
      },
      statistics: Object.fromEntries(
        Array.from(stats.entries()).map(([colName, colStats]) => [
          colName,
          {
            count: colStats.count,
            unique: colStats.unique,
            nullCount: colStats.nullCount,
            ...(colStats.min !== undefined && { min: colStats.min }),
            ...(colStats.max !== undefined && { max: colStats.max }),
            ...(colStats.avg !== undefined && { avg: Number(colStats.avg.toFixed(2)) }),
            ...(colStats.sum !== undefined && { sum: colStats.sum }),
          },
        ])
      ),
      dataQuality: {
        completeness: Number(
          (
            (1 -
              parsedData.rows.reduce(
                (acc, row) =>
                  acc +
                  parsedData.headers.filter((h) => row[h] === null || row[h] === undefined).length,
                0
              ) /
                (parsedData.rowCount * parsedData.columnCount)) *
            100
          ).toFixed(2)
        ),
        missingValues: parsedData.rows.reduce(
          (acc, row) =>
            acc + parsedData.headers.filter((h) => row[h] === null || row[h] === undefined).length,
          0
        ),
      },
      recommendations: generateRecommendations(parsedData, stats),
    }

    return JSON.stringify(analysis, null, 2)
  } catch (error) {
    return JSON.stringify({
      error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

//=============================================================================
// generate_chart Tool
//=============================================================================

export const generateChartDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_chart',
    description:
      'Generate chart configuration and data from a CSV or JSON file. Supports bar, line, pie, and scatter charts.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the data file (relative to project root)',
        },
        file_type: {
          type: 'string',
          enum: ['csv', 'json'],
          description: 'Type of data file',
        },
        chart_type: {
          type: 'string',
          enum: ['bar', 'line', 'pie', 'scatter'],
          description: 'Type of chart to generate',
        },
        x_axis: {
          type: 'string',
          description: 'Column name for X-axis (labels for bar/line/pie, numeric for scatter)',
        },
        y_axis: {
          type: 'string',
          description: 'Column name for Y-axis (values for bar/line/pie, numeric for scatter)',
        },
        color_by: {
          type: 'string',
          description: 'Optional column name to color data points by (for scatter charts)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of data points to include (default: 50)',
        },
      },
      required: ['path', 'file_type', 'chart_type', 'x_axis', 'y_axis'],
    },
  },
}

export const generateChartExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<string> => {
  const {
    path,
    file_type,
    chart_type,
    x_axis,
    y_axis,
    limit = 50,
  } = args as {
    path: string
    file_type: 'csv' | 'json'
    chart_type: 'bar' | 'line' | 'pie' | 'scatter'
    x_axis: string
    y_axis: string
    limit?: number
  }
  const filePath = path
  const fileType = file_type
  const chartType = chart_type
  const xAxis = x_axis
  const yAxis = y_axis

  const directoryHandle = await resolveNativeDirectoryHandle(context.directoryHandle, context.workspaceId)
  if (!directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a folder first.' })
  }

  try {
    // Read file content
    let fileContent: string
    try {
      const fileHandle = await getFileHandle(directoryHandle, filePath)
      const file = await fileHandle.getFile()
      fileContent = await file.text()
    } catch (error) {
      return JSON.stringify({
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }

    // Parse data
    let parsedData: ParsedData
    try {
      if (fileType === 'csv') {
        parsedData = parseCSV(fileContent)
      } else {
        parsedData = parseJSON(fileContent)
      }
    } catch (error) {
      return JSON.stringify({
        error: `Failed to parse data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }

    // Validate columns exist
    if (!parsedData.headers.includes(xAxis)) {
      return JSON.stringify({ error: `X-axis column "${xAxis}" not found in data` })
    }
    if (!parsedData.headers.includes(yAxis)) {
      return JSON.stringify({ error: `Y-axis column "${yAxis}" not found in data` })
    }

    // Prepare chart data based on chart type
    let chartData: Array<{ label: string; value: number; x?: number; y?: number }>

    if (chartType === 'scatter') {
      // Scatter chart: x and y must be numeric
      chartData = parsedData.rows
        .slice(0, limit)
        .map((row) => ({
          label: String(row[xAxis]),
          value: Number(row[yAxis]) || 0,
          x: Number(row[xAxis]) || 0,
          y: Number(row[yAxis]) || 0,
        }))
        .filter((d) => !isNaN(d.x) && !isNaN(d.y))
    } else {
      // Bar, line, pie charts: aggregate data by x-axis
      const aggregated = new Map<string, number>()

      for (const row of parsedData.rows) {
        const key = String(row[xAxis])
        const value = Number(row[yAxis]) || 0

        if (!isNaN(value)) {
          aggregated.set(key, (aggregated.get(key) || 0) + value)
        }
      }

      chartData = Array.from(aggregated.entries())
        .slice(0, limit)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
    }

    const result = {
      chartType,
      title: `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart: ${yAxis} by ${xAxis}`,
      data: chartData,
      xAxis,
      yAxis,
      dataPointCount: chartData.length,
      visualization: {
        type: chartType,
        chartData,
        title: `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart`,
      },
    }

    return JSON.stringify(result, null, 2)
  } catch (error) {
    return JSON.stringify({
      error: `Chart generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

//=============================================================================
// filter_data Tool
//=============================================================================

export const filterDataDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'filter_data',
    description:
      'Filter data from a CSV or JSON file based on criteria. Supports operators: eq, ne, gt, lt, gte, lte, contains, startsWith, endsWith.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the data file (relative to project root)',
        },
        file_type: {
          type: 'string',
          enum: ['csv', 'json'],
          description: 'Type of data file',
        },
        filters: {
          type: 'array',
          description: 'Array of filter criteria',
          items: {
            type: 'object',
            properties: {
              column: {
                type: 'string',
                description: 'Column name to filter on',
              },
              operator: {
                type: 'string',
                enum: ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'contains', 'startsWith', 'endsWith'],
                description: 'Comparison operator',
              },
              value: {
                description: 'Value to compare against',
                type: 'string',
              },
            },
            required: ['column', 'operator', 'value'],
          },
        },
        export_format: {
          type: 'string',
          enum: ['json', 'csv'],
          description: 'Format to export filtered data (default: json)',
        },
      },
      required: ['path', 'file_type', 'filters'],
    },
  },
}

export const filterDataExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<string> => {
  const {
    path,
    file_type,
    filters,
    export_format,
  } = args as {
    path: string
    file_type: 'csv' | 'json'
    filters: Array<{ column: string; operator: string; value: unknown }>
    export_format?: 'json' | 'csv'
  }
  const filePath = path
  const fileType = file_type
  const exportFormat = (export_format ?? 'json') as 'json' | 'csv'

  const directoryHandle = await resolveNativeDirectoryHandle(context.directoryHandle, context.workspaceId)
  if (!directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a folder first.' })
  }

  try {
    // Read file content
    let fileContent: string
    try {
      const fileHandle = await getFileHandle(directoryHandle, filePath)
      const file = await fileHandle.getFile()
      fileContent = await file.text()
    } catch (error) {
      return JSON.stringify({
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }

    // Parse data
    let parsedData: ParsedData
    try {
      if (fileType === 'csv') {
        parsedData = parseCSV(fileContent)
      } else {
        parsedData = parseJSON(fileContent)
      }
    } catch (error) {
      return JSON.stringify({
        error: `Failed to parse data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }

    // Apply filters
    const filteredRows = filterData(
      parsedData.rows,
      filters as Array<{
        column: string
        operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'endsWith'
        value: unknown
      }>
    )

    const result = {
      originalRows: parsedData.rowCount,
      filteredRows: filteredRows.length,
      filtersApplied: filters.length,
      data: filteredRows,
    }

    if (exportFormat === 'csv') {
      const filteredParsedData: ParsedData = {
        ...parsedData,
        rows: filteredRows,
        rowCount: filteredRows.length,
      }
      return exportToCSV(filteredParsedData)
    }

    return JSON.stringify(result, null, 2)
  } catch (error) {
    return JSON.stringify({
      error: `Filter operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

//=============================================================================
// aggregate_data Tool
//=============================================================================

export const aggregateDataDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'aggregate_data',
    description:
      'Aggregate data by grouping column and applying aggregation functions (count, sum, avg, min, max).',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the data file (relative to project root)',
        },
        file_type: {
          type: 'string',
          enum: ['csv', 'json'],
          description: 'Type of data file',
        },
        group_by: {
          type: 'string',
          description: 'Column name to group by',
        },
        aggregations: {
          type: 'object',
          description: 'Aggregation functions for columns (e.g., {"value": "sum"})',
        },
      },
      required: ['path', 'file_type', 'group_by', 'aggregations'],
    },
  },
}

export const aggregateDataExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context: ToolContext
): Promise<string> => {
  const { path, file_type, group_by, aggregations } = args as {
    path: string
    file_type: 'csv' | 'json'
    group_by: string
    aggregations: Record<string, 'count' | 'sum' | 'avg' | 'min' | 'max'>
  }
  const filePath = path
  const fileType = file_type
  const groupBy = group_by

  const directoryHandle = await resolveNativeDirectoryHandle(context.directoryHandle, context.workspaceId)
  if (!directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a folder first.' })
  }

  try {
    // Read file content
    let fileContent: string
    try {
      const fileHandle = await getFileHandle(directoryHandle, filePath)
      const file = await fileHandle.getFile()
      fileContent = await file.text()
    } catch (error) {
      return JSON.stringify({
        error: `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }

    // Parse data
    let parsedData: ParsedData
    try {
      if (fileType === 'csv') {
        parsedData = parseCSV(fileContent)
      } else {
        parsedData = parseJSON(fileContent)
      }
    } catch (error) {
      return JSON.stringify({
        error: `Failed to parse data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      })
    }

    // Validate groupBy column exists
    if (!parsedData.headers.includes(groupBy)) {
      return JSON.stringify({ error: `Group by column "${groupBy}" not found in data` })
    }

    // Validate aggregation columns exist
    for (const targetColumn of Object.keys(aggregations)) {
      if (targetColumn !== groupBy) {
        // Extract source column name from target column name
        // e.g., "value_sum" -> "value", "total_avg" -> "total"
        const suffixMatch = targetColumn.match(/_(sum|avg|min|max|count)$/)
        const sourceColumn = suffixMatch
          ? targetColumn.substring(0, targetColumn.lastIndexOf('_'))
          : targetColumn

        if (!parsedData.headers.includes(sourceColumn)) {
          return JSON.stringify({ error: `Aggregation column "${sourceColumn}" not found in data` })
        }
      }
    }

    // Apply aggregation
    const aggregatedRows = aggregateData(parsedData.rows, groupBy, aggregations)

    const result = {
      groupBy,
      aggregations,
      groupCount: aggregatedRows.length,
      data: aggregatedRows,
    }

    return JSON.stringify(result, null, 2)
  } catch (error) {
    return JSON.stringify({
      error: `Aggregation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    })
  }
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Get file handle from path
 */
async function getFileHandle(
  directoryHandle: FileSystemDirectoryHandle,
  filePath: string
): Promise<FileSystemFileHandle> {
  const parts = filePath.split('/').filter(Boolean)

  let currentHandle: FileSystemDirectoryHandle = directoryHandle

  for (let i = 0; i < parts.length - 1; i++) {
    currentHandle = await currentHandle.getDirectoryHandle(parts[i])
  }

  return await currentHandle.getFileHandle(parts[parts.length - 1])
}

/**
 * Generate data quality recommendations
 */
function generateRecommendations(parsedData: ParsedData, stats: Map<string, DataStats>): string[] {
  const recommendations: string[] = []

  // Check for high null counts
  for (const [colName, colStats] of stats) {
    const nullPercentage = (colStats.nullCount / parsedData.rowCount) * 100
    if (nullPercentage > 50) {
      recommendations.push(
        `Column "${colName}" has ${nullPercentage.toFixed(1)}% missing values. Consider imputation or removal.`
      )
    } else if (nullPercentage > 20) {
      recommendations.push(
        `Column "${colName}" has ${nullPercentage.toFixed(1)}% missing values. Review data quality.`
      )
    }
  }

  // Check for low cardinality columns
  for (const column of parsedData.columns) {
    if (
      column.type === 'string' &&
      column.unique < 5 &&
      column.unique / parsedData.rowCount < 0.05
    ) {
      recommendations.push(
        `Column "${column.name}" has low cardinality (${column.unique} unique values). Consider using as a category.`
      )
    }
  }

  // Check for potential numeric columns stored as strings
  for (const column of parsedData.columns) {
    if (column.type === 'string') {
      const sampleValues = column.examples.slice(0, 10).filter((v) => v !== null && v !== undefined)
      const numericCount = sampleValues.filter((v) => !isNaN(Number(v))).length

      if (numericCount / sampleValues.length > 0.8) {
        recommendations.push(
          `Column "${column.name}" appears to contain numeric values but is stored as strings. Consider type conversion.`
        )
      }
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('Data quality looks good! No major issues detected.')
  }

  return recommendations
}
