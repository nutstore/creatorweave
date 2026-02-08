/**
 * Utility Tools
 *
 * File conversion and data transformation utilities.
 * Supports JSON, CSV formats and data aggregation.
 *
 * @module utility-tools
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'

// ============================================================================
// Tool Definitions
// ============================================================================

export interface ConvertFormatArgs {
  /** Input data */
  data: string | Record<string, unknown> | unknown[]
  /** Target format */
  target_format: 'json' | 'csv' | 'markdown'
  /** Source format (auto-detect if not provided) */
  source_format?: 'json' | 'csv' | 'auto'
  /** Indentation for JSON */
  indent?: number
}

export interface AggregateDataArgs {
  /** Data to aggregate */
  data: Record<string, unknown>[] | unknown[][]
  /** Group by column */
  group_by: string
  /** Aggregation operations */
  operations: Array<{
    column: string
    operation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'unique'
    output_column?: string
  }>
  /** Sort results by */
  sort_by?: string
  /** Sort direction */
  sort_direction?: 'asc' | 'desc'
}

export interface TransformDataArgs {
  /** Data to transform */
  data: Record<string, unknown>[] | unknown[][]
  /** Transformations to apply */
  transformations: Array<{
    type: 'rename' | 'filter' | 'select' | 'drop'
    column?: string
    new_name?: string
    condition?: string
    columns?: string[]
  }>
}

export const convert_format: ToolDefinition = {
  type: 'function',
  function: {
    name: 'convert_format',
    description:
      'Convert data between formats (JSON, CSV, Markdown). Auto-detects source format if not specified.',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'string',
          description: 'Input data (string or object/array)',
        },
        target_format: {
          type: 'string',
          enum: ['json', 'csv', 'markdown'],
          description: 'Target format',
        },
        source_format: {
          type: 'string',
          enum: ['json', 'csv', 'auto'],
          description: 'Source format (auto-detect if not provided)',
        },
        indent: {
          type: 'number',
          description: 'Indentation level for JSON output (default: 2)',
        },
      },
      required: ['data', 'target_format'],
    },
  },
}

export const aggregate_data: ToolDefinition = {
  type: 'function',
  function: {
    name: 'aggregate_data',
    description:
      'Aggregate data by grouping and calculating statistics (sum, avg, min, max, count, unique).',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          description: 'Data to aggregate',
        },
        group_by: {
          type: 'string',
          description: 'Column name to group by',
        },
        operations: {
          type: 'array',
          description: 'Aggregation operations to perform',
        },
        sort_by: {
          type: 'string',
          description: 'Column to sort results by',
        },
        sort_direction: {
          type: 'string',
          enum: ['asc', 'desc'],
          description: 'Sort direction',
        },
      },
      required: ['data', 'group_by', 'operations'],
    },
  },
}

export const transform_data: ToolDefinition = {
  type: 'function',
  function: {
    name: 'transform_data',
    description: 'Transform data by renaming columns, filtering rows, selecting/dropping columns.',
    parameters: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          description: 'Data to transform',
        },
        transformations: {
          type: 'array',
          description: 'Transformations to apply',
        },
      },
      required: ['data', 'transformations'],
    },
  },
}

// ============================================================================
// Helper Functions
// ============================================================================

function parseData(data: unknown): { headers: string[]; values: Record<string, unknown>[] } {
  if (Array.isArray(data) && data.length > 0) {
    if (typeof data[0] === 'object' && !Array.isArray(data[0])) {
      return {
        headers: Object.keys(data[0] as Record<string, unknown>),
        values: data as Record<string, unknown>[],
      }
    }
    if (Array.isArray(data[0])) {
      const headers = (data[0] as unknown[]).map((_, i) => `col${i}`)
      return {
        headers,
        values: (data as unknown[][]).map((row) =>
          headers.reduce(
            (obj, header, idx) => {
              obj[header] = row[idx]
              return obj
            },
            {} as Record<string, unknown>
          )
        ),
      }
    }
  }
  return { headers: [], values: [] }
}

function detectFormat(content: string): string {
  const trimmed = content.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json'
  }
  if (/^[^,]+,[^,]+/.test(trimmed) || trimmed.includes(',')) {
    return 'csv'
  }
  return 'json'
}

function jsonToCsv(obj: unknown[]): string {
  if (!Array.isArray(obj) || obj.length === 0) return ''
  const headers = Object.keys(obj[0] as Record<string, unknown>)
  const rows = obj.map((row) =>
    headers.map((h) => {
      const val = (row as Record<string, unknown>)[h]
      if (val === null || val === undefined) return ''
      if (typeof val === 'string' && (val.includes(',') || val.includes('"')))
        return `"${val.replace(/"/g, '""')}"`
      return String(val)
    })
  )
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

function csvToJson(csv: string): string {
  const lines = csv.trim().split('\n')
  if (lines.length < 2) return '[]'
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const data = lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    return headers.reduce(
      (obj, header, idx) => {
        obj[header] = values[idx]
        return obj
      },
      {} as Record<string, unknown>
    )
  })
  return JSON.stringify(data, null, 2)
}

function jsonToMarkdown(obj: unknown, title = 'Data'): string {
  if (!Array.isArray(obj) || obj.length === 0) return `# ${title}\n\nNo data`
  const arr = obj as Record<string, unknown>[]
  const headers = Object.keys(arr[0])
  const rows = arr.map((row) => headers.map((h) => String(row[h] ?? '')))
  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const formatRow = (cells: string[]) =>
    cells.map((cell, i) => cell.padEnd(colWidths[i])).join('  | ')
  const separator = colWidths.map((w) => '-'.repeat(w + 2)).join('+')
  return `# ${title}\n\n| ${formatRow(headers)} |\n|${separator}|\n${rows
    .map((r) => '| ' + formatRow(r) + ' |')
    .join('\n')}\n`
}

// ============================================================================
// Tool Executors
// ============================================================================

export const convert_format_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    let inputData: unknown
    let sourceFormat = (args.source_format as string) || 'auto'

    if (typeof args.data === 'string') {
      if (sourceFormat === 'auto') {
        sourceFormat = detectFormat(args.data)
      }
      if (sourceFormat === 'csv') {
        inputData = JSON.parse(csvToJson(args.data))
      } else {
        inputData = JSON.parse(args.data)
      }
    } else {
      inputData = args.data
    }

    const targetFormat = args.target_format as string
    const indent = (args.indent as number) || 2

    let result: string

    switch (targetFormat) {
      case 'csv':
        result = jsonToCsv(Array.isArray(inputData) ? inputData : [inputData])
        break

      case 'markdown':
        result = jsonToMarkdown(inputData as unknown)
        break

      case 'json':
      default:
        result = JSON.stringify(inputData, null, indent)
    }

    return JSON.stringify({
      success: true,
      source_format: sourceFormat,
      target_format: targetFormat,
      result,
      message: `Converted ${sourceFormat} to ${targetFormat}`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export const aggregate_data_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const data = args.data as Record<string, unknown>[] | unknown[][]
    const groupBy = args.group_by as string
    const operations = args.operations as Array<{
      column: string
      operation: string
      output_column?: string
    }>
    const sortBy = args.sort_by as string
    const sortDirection = (args.sort_direction as 'asc' | 'desc') || 'asc'

    const { headers, values } = parseData(data)
    const groupIndex = headers.indexOf(groupBy)

    if (groupIndex < 0) {
      return JSON.stringify({
        success: false,
        error: `Group by column '${groupBy}' not found`,
      })
    }

    // Group data
    const groups: Record<string, Record<string, unknown>[]> = {}
    values.forEach((row) => {
      const key = String(row[groupBy] ?? 'undefined')
      if (!groups[key]) groups[key] = []
      groups[key].push(row)
    })

    // Aggregate
    const results: Record<string, unknown>[] = Object.entries(groups).map(([key, groupRows]) => {
      const result: Record<string, unknown> = { [groupBy]: key }

      operations.forEach((op) => {
        const colValues = groupRows
          .map((r) => r[op.column])
          .filter((v) => v !== undefined && v !== null)
        const numValues = colValues.map(Number).filter((n) => !isNaN(n))
        const outputCol = op.output_column || `${op.operation}_${op.column}`

        switch (op.operation) {
          case 'sum':
            result[outputCol] = numValues.reduce((a, b) => a + b, 0)
            break
          case 'avg':
            result[outputCol] =
              numValues.length > 0 ? numValues.reduce((a, b) => a + b, 0) / numValues.length : 0
            break
          case 'min':
            result[outputCol] = numValues.length > 0 ? Math.min(...numValues) : null
            break
          case 'max':
            result[outputCol] = numValues.length > 0 ? Math.max(...numValues) : null
            break
          case 'count':
            result[outputCol] = groupRows.length
            break
          case 'unique':
            result[outputCol] = [...new Set(colValues.map(String))].length
            break
        }
      })

      return result
    })

    // Sort
    if (sortBy) {
      results.sort((a, b) => {
        const aVal = a[sortBy] as number | string
        const bVal = b[sortBy] as number | string
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        }
        return sortDirection === 'asc'
          ? String(aVal).localeCompare(String(bVal))
          : String(bVal).localeCompare(String(aVal))
      })
    }

    return JSON.stringify({
      success: true,
      group_by: groupBy,
      group_count: Object.keys(groups).length,
      result: results,
      message: `Aggregated ${values.length} rows into ${Object.keys(groups).length} groups`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

export const transform_data_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const data = args.data as Record<string, unknown>[] | unknown[][]
    const transformations = args.transformations as Array<{
      type: string
      column?: string
      new_name?: string
      condition?: string
      columns?: string[]
    }>

    let { headers, values } = parseData(data)

    transformations.forEach((transform) => {
      switch (transform.type) {
        case 'rename':
          if (transform.column && transform.new_name) {
            const idx = headers.indexOf(transform.column)
            if (idx >= 0) headers[idx] = transform.new_name
          }
          break

        case 'filter':
          if (transform.condition) {
            values = values.filter((row) => {
              try {
                const colValue = row[transform.condition as string]
                return colValue !== undefined && colValue !== null && colValue !== ''
              } catch {
                return true
              }
            })
          }
          break

        case 'select':
          if (transform.columns && transform.columns.length > 0) {
            headers = headers.filter((h) => transform.columns!.includes(h))
            values = values.map((row) => {
              const newRow: Record<string, unknown> = {}
              transform.columns!.forEach((col) => {
                newRow[col] = row[col]
              })
              return newRow
            })
          }
          break

        case 'drop':
          if (transform.column) {
            headers = headers.filter((h) => h !== transform.column)
            values = values.map((row) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { [transform.column!]: _, ...rest } = row
              return rest
            })
          }
          break
      }
    })

    return JSON.stringify({
      success: true,
      columns: headers,
      row_count: values.length,
      transformed_data: values,
      message: `Transformed ${data.length} rows with ${transformations.length} operations`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
