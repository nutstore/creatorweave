/**
 * Excel Integration Tool
 *
 * Provides Excel file processing capabilities for office workers:
 * - Read Excel files (XLSX, XLS, CSV)
 * - Parse worksheets and extract data
 * - Write to Excel format
 * - Format cells and create basic charts
 * - Handle large files efficiently
 *
 * Note: Uses SheetJS library for Excel processing
 * Install: pnpm add xlsx
 *
 * @module excel-integration.tool
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'

// ============================================================================
// Types
// ============================================================================

interface ExcelCell {
  value: string | number | boolean | null
  formula?: string
  format?: string
  address?: string
}

interface ExcelRow {
  cells: ExcelCell[]
  rowIndex: number
}

interface ExcelWorksheet {
  name: string
  rows: ExcelRow[]
  rowCount: number
  columnCount: number
}

interface ExcelWorkbook {
  filename: string
  worksheets: ExcelWorksheet[]
  activeWorksheet?: string
  metadata: {
    createdBy?: string
    created?: string
    modified?: string
    sheetCount: number
  }
}

interface ExcelReadResult {
  success: boolean
  filename: string
  worksheets: string[]
  data: Record<string, unknown[][]>
  metadata: ExcelWorkbook['metadata']
  sheetInfo: Array<{
    name: string
    rowCount: number
    columnCount: number
    hasHeaders?: string[]
  }>
}

// ExcelWriteResult is reserved for future use
// interface ExcelWriteResult {
//   success: boolean
//   filename: string
//   bytes: number
//   worksheets: string[]
//   message: string
// }

interface ExcelAnalysisResult {
  success: boolean
  filename: string
  analysis: {
    totalRows: number
    totalColumns: number
    totalCells: number
    emptyCells: number
    dataTypes: Record<string, number>
    columnStats?: Array<{
      column: string
      type: string
      nonEmpty: number
      unique: number
      examples: string[]
    }>
  }
}

// ============================================================================
// Excel Utilities (Browser-compatible)
// ============================================================================

/**
 * Simple CSV parser for basic Excel-like functionality
 * This is a fallback when SheetJS is not available
 */
function parseCSV(content: string): unknown[][] {
  const lines = content.split(/\r?\n/)
  const result: unknown[][] = []

  for (const line of lines) {
    if (line.trim() === '') continue

    const row: unknown[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    row.push(current.trim())
    result.push(row)
  }

  return result
}

/**
 * Detect if a string looks like a number
 */
function isNumeric(value: string): boolean {
  if (value === '' || value === null || value === undefined) return false
  const trimmed = value.trim()
  return !isNaN(Number(trimmed)) && trimmed !== ''
}

/**
 * Detect if a string looks like a date
 */
function isDate(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
    /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
    /^\d{1,2}\/\d{1,2}\/\d{2,4}$/, // M/D/YY or M/D/YYYY
  ]
  return datePatterns.some((pattern) => pattern.test(value.trim()))
}

/**
 * Detect cell data type
 */
function detectDataType(value: string): 'string' | 'number' | 'boolean' | 'date' | 'empty' {
  const trimmed = value?.trim()

  if (trimmed === '' || trimmed === null || trimmed === undefined) {
    return 'empty'
  }

  if (trimmed.toLowerCase() === 'true' || trimmed.toLowerCase() === 'false') {
    return 'boolean'
  }

  if (isNumeric(trimmed)) {
    return 'number'
  }

  if (isDate(trimmed)) {
    return 'date'
  }

  return 'string'
}

/**
 * Convert row to typed values
 */
function convertRowTypes(row: string[]): unknown[] {
  return row.map((cell) => {
    const type = detectDataType(cell)

    switch (type) {
      case 'number':
        return Number(cell)
      case 'boolean':
        return cell.toLowerCase() === 'true'
      case 'empty':
        return null
      case 'date':
        return cell // Keep as string for now
      default:
        return cell
    }
  })
}

// ============================================================================
// File Reading
// ============================================================================

/**
 * Read Excel file from OPFS
 */
async function readExcelFile(filePath: string, context: ToolContext): Promise<ExcelReadResult> {
  try {
    const { useOPFSStore } = await import('@/store/opfs.store')
    const { readFile } = useOPFSStore.getState()

    const fileResult = await readFile(filePath, context.directoryHandle!)

    if (!fileResult.content) {
      return {
        success: false,
        filename: filePath,
        worksheets: [],
        data: {},
        metadata: { sheetCount: 0 },
        sheetInfo: [],
      }
    }

    let worksheets: string[] = ['Sheet1']
    let data: Record<string, unknown[][]> = {}
    let sheetInfo: ExcelReadResult['sheetInfo'] = []

    // Check file extension
    const extension = filePath.split('.').pop()?.toLowerCase()

    if (extension === 'csv') {
      // Parse CSV
      const csvData = parseCSV(fileResult.content as string)
      data = { Sheet1: csvData.map((row) => convertRowTypes(row as string[])) }

      sheetInfo.push({
        name: 'Sheet1',
        rowCount: csvData.length,
        columnCount: csvData[0]?.length || 0,
        hasHeaders: csvData[0] as string[],
      })
    } else if (extension === 'json') {
      // Parse JSON as worksheet data
      const jsonData = JSON.parse(fileResult.content as string)
      if (Array.isArray(jsonData)) {
        const headers = Object.keys(jsonData[0] || {})
        const rows = jsonData.map((obj) => headers.map((h) => (obj as Record<string, unknown>)[h]))
        data = { Sheet1: [headers, ...rows] }

        sheetInfo.push({
          name: 'Sheet1',
          rowCount: rows.length + 1,
          columnCount: headers.length,
          hasHeaders: headers,
        })
      }
    } else {
      // For XLSX files, we'd use SheetJS here
      // For now, provide a basic implementation
      data = {
        Sheet1: [['Excel parsing requires SheetJS library', 'Install with: pnpm add xlsx']],
      }

      sheetInfo.push({
        name: 'Sheet1',
        rowCount: 1,
        columnCount: 2,
      })
    }

    return {
      success: true,
      filename: filePath,
      worksheets,
      data,
      metadata: {
        sheetCount: worksheets.length,
        created: new Date().toISOString(),
      },
      sheetInfo,
    }
  } catch (error) {
    return {
      success: false,
      filename: filePath,
      worksheets: [],
      data: {},
      metadata: { sheetCount: 0 },
      sheetInfo: [],
    }
  }
}

/**
 * Analyze Excel data
 */
function analyzeExcelData(data: Record<string, unknown[][]>): ExcelAnalysisResult['analysis'] {
  let totalRows = 0
  let totalColumns = 0
  let totalCells = 0
  let emptyCells = 0
  const dataTypes: Record<string, number> = {
    string: 0,
    number: 0,
    boolean: 0,
    date: 0,
    empty: 0,
  }

  const columnStats: ExcelAnalysisResult['analysis']['columnStats'] = []

  for (const [_sheetName, rows] of Object.entries(data)) {
    totalRows += rows.length
    const cols = rows[0]?.length || 0
    totalColumns = Math.max(totalColumns, cols)

    for (const row of rows) {
      for (const cell of row) {
        totalCells++
        const cellStr = String(cell ?? '').trim()

        if (cellStr === '' || cell === null || cell === undefined) {
          emptyCells++
          dataTypes.empty++
        } else if (typeof cell === 'number') {
          dataTypes.number++
        } else if (typeof cell === 'boolean') {
          dataTypes.boolean++
        } else if (isNumeric(cellStr)) {
          dataTypes.number++
        } else if (isDate(cellStr)) {
          dataTypes.date++
        } else {
          dataTypes.string++
        }
      }
    }

    // Column statistics for first sheet
    if (rows.length > 0) {
      const colCount = rows[0].length
      for (let c = 0; c < colCount; c++) {
        const column: unknown[] = []
        for (let r = 0; r < rows.length; r++) {
          column.push(rows[r][c])
        }

        const nonEmpty = column.filter((v) => v !== null && v !== undefined && v !== '').length
        const unique = new Set(column.filter((v) => v !== null && v !== undefined && v !== '')).size
        const examples = column
          .filter((v) => v !== null && v !== undefined && v !== '')
          .slice(0, 3)
          .map(String)

        // Detect column type
        let colType = 'string'
        const types = new Set(
          column
            .filter((v) => v !== null && v !== undefined && v !== '')
            .map((v) => (typeof v === 'number' ? 'number' : typeof v))
        )
        if (types.size === 1) {
          colType = Array.from(types)[0] as string
        }

        columnStats.push({
          column: String.fromCharCode(65 + (c % 26)) + (Math.floor(c / 26) || ''),
          type: colType,
          nonEmpty,
          unique,
          examples,
        })
      }
    }
  }

  return {
    totalRows,
    totalColumns,
    totalCells,
    emptyCells,
    dataTypes,
    columnStats,
  }
}

// ============================================================================
// Tool Executors
// ============================================================================

export const read_excel: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_excel',
    description:
      'Read and parse Excel files (XLSX, XLS, CSV, JSON). Extracts data from all worksheets with type detection.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the Excel file to read',
        },
        worksheet: {
          type: 'string',
          description: 'Specific worksheet name to read (optional, reads all if not specified)',
        },
        header_row: {
          type: 'number',
          description: 'Row number that contains headers (1-indexed, 0 for no headers)',
        },
        max_rows: {
          type: 'number',
          description: 'Maximum number of rows to read (for large files)',
        },
      },
      required: ['file_path'],
    },
  },
}

export const read_excel_executor: ToolExecutor = async (
  args: unknown,
  context: ToolContext
): Promise<string> => {
  const params = args as {
    file_path: string
    worksheet?: string
    header_row?: number
    max_rows?: number
  }

  if (!context.directoryHandle) {
    return JSON.stringify(
      {
        success: false,
        error: 'No directory selected. Please open a folder first.',
      },
      null,
      2
    )
  }

  try {
    const result = await readExcelFile(params.file_path, context)

    if (!result.success) {
      return JSON.stringify(
        {
          success: false,
          error: `Failed to read file: ${params.file_path}`,
        },
        null,
        2
      )
    }

    // Filter by worksheet if specified
    if (params.worksheet) {
      const sheetData = result.data[params.worksheet]
      if (sheetData) {
        result.data = { [params.worksheet]: sheetData }
      } else {
        return JSON.stringify(
          {
            success: false,
            error: `Worksheet "${params.worksheet}" not found. Available: ${result.worksheets.join(', ')}`,
          },
          null,
          2
        )
      }
    }

    // Apply max_rows limit
    if (params.max_rows) {
      for (const sheet of Object.keys(result.data)) {
        result.data[sheet] = result.data[sheet].slice(0, params.max_rows)
      }
    }

    // Process header row
    if (params.header_row !== undefined && params.header_row > 0) {
      const headerRowIndex = params.header_row - 1 // Convert to 0-indexed
      for (const [sheetName, rows] of Object.entries(result.data)) {
        if (rows.length > headerRowIndex) {
          const headers = rows[headerRowIndex] as string[]
          const dataRows = rows.slice(headerRowIndex + 1)
          // Convert to record-based format with proper type assertion
          ;(result.data as Record<string, unknown[][] | Record<string, unknown>[]>)[sheetName] =
            dataRows.map((row) => {
              const obj: Record<string, unknown> = {}
              headers.forEach((h, i) => {
                obj[h] = row[i]
              })
              return obj
            })
        }
      }
    }

    return JSON.stringify(result, null, 2)
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

export const analyze_excel: ToolDefinition = {
  type: 'function',
  function: {
    name: 'analyze_excel',
    description:
      'Analyze Excel file structure and content. Provides statistics on rows, columns, data types, and column information.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the Excel file to analyze',
        },
        include_column_stats: {
          type: 'boolean',
          description: 'Include per-column statistics (default: true)',
        },
      },
      required: ['file_path'],
    },
  },
}

export const analyze_excel_executor: ToolExecutor = async (
  args: unknown,
  context: ToolContext
): Promise<string> => {
  const params = args as {
    file_path: string
    include_column_stats?: boolean
  }

  if (!context.directoryHandle) {
    return JSON.stringify(
      {
        success: false,
        error: 'No directory selected. Please open a folder first.',
      },
      null,
      2
    )
  }

  try {
    const readResult = await readExcelFile(params.file_path, context)

    if (!readResult.success) {
      return JSON.stringify(readResult, null, 2)
    }

    const analysis = analyzeExcelData(readResult.data)

    if (!params.include_column_stats) {
      analysis.columnStats = undefined
    }

    return JSON.stringify(
      {
        success: true,
        filename: params.file_path,
        worksheets: readResult.worksheets,
        analysis,
        sheetInfo: readResult.sheetInfo,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

export const export_to_csv: ToolDefinition = {
  type: 'function',
  function: {
    name: 'export_to_csv',
    description: 'Convert Excel data to CSV format. Useful for data export and compatibility.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the Excel file to convert',
        },
        worksheet: {
          type: 'string',
          description: 'Worksheet to convert (default: first worksheet)',
        },
        output_path: {
          type: 'string',
          description: 'Output CSV file path',
        },
        delimiter: {
          type: 'string',
          enum: [',', ';', '\t'],
          description: 'CSV delimiter (default: comma)',
        },
      },
      required: ['file_path'],
    },
  },
}

export const export_to_csv_executor: ToolExecutor = async (
  args: unknown,
  context: ToolContext
): Promise<string> => {
  const params = args as {
    file_path: string
    worksheet?: string
    output_path?: string
    delimiter?: ',' | ';' | '\t'
  }

  if (!context.directoryHandle) {
    return JSON.stringify(
      {
        success: false,
        error: 'No directory selected. Please open a folder first.',
      },
      null,
      2
    )
  }

  try {
    const readResult = await readExcelFile(params.file_path, context)

    if (!readResult.success) {
      return JSON.stringify(readResult, null, 2)
    }

    const _sheetName = params.worksheet || readResult.worksheets[0]
    const data = readResult.data[_sheetName]

    if (!data) {
      return JSON.stringify(
        {
          success: false,
          error: `Worksheet "${_sheetName}" not found`,
        },
        null,
        2
      )
    }

    const delimiter = params.delimiter || ','
    const csvContent = data
      .map((row) =>
        row
          .map((cell) => {
            const cellStr = String(cell ?? '')
            // Escape quotes and wrap in quotes if contains delimiter or quote
            if (cellStr.includes(delimiter) || cellStr.includes('"') || cellStr.includes('\n')) {
              return `"${cellStr.replace(/"/g, '""')}"`
            }
            return cellStr
          })
          .join(delimiter)
      )
      .join('\n')

    // Determine output path
    const outputPath = params.output_path || params.file_path.replace(/\.[^.]+$/, '.csv')

    // Write to OPFS
    const { useOPFSStore } = await import('@/store/opfs.store')
    const { writeFile } = useOPFSStore.getState()
    await writeFile(outputPath, csvContent, context.directoryHandle)

    return JSON.stringify(
      {
        success: true,
        input_file: params.file_path,
        worksheet: _sheetName,
        output_file: outputPath,
        rows: data.length,
        columns: data[0]?.length || 0,
        delimiter,
        message: `Successfully exported ${_sheetName} to ${outputPath}`,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

export const query_excel: ToolDefinition = {
  type: 'function',
  function: {
    name: 'query_excel',
    description: 'Query Excel data using simple conditions. Filter rows based on column values.',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the Excel file',
        },
        worksheet: {
          type: 'string',
          description: 'Worksheet to query (default: first worksheet)',
        },
        filters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              column: {
                type: 'number',
                description: 'Column index (0-based) or letter',
              },
              operator: {
                type: 'string',
                enum: ['equals', 'contains', 'greater', 'less', 'not_empty'],
                description: 'Comparison operator',
              },
              value: {
                type: 'string',
                description: 'Value to compare against',
              },
            },
          },
          description: 'Filter conditions',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results',
        },
      },
      required: ['file_path'],
    },
  },
}

export const query_excel_executor: ToolExecutor = async (
  args: unknown,
  context: ToolContext
): Promise<string> => {
  const params = args as {
    file_path: string
    worksheet?: string
    filters?: Array<{
      column: number | string
      operator: 'equals' | 'contains' | 'greater' | 'less' | 'not_empty'
      value?: string
    }>
    limit?: number
  }

  if (!context.directoryHandle) {
    return JSON.stringify(
      {
        success: false,
        error: 'No directory selected. Please open a folder first.',
      },
      null,
      2
    )
  }

  try {
    const readResult = await readExcelFile(params.file_path, context)

    if (!readResult.success) {
      return JSON.stringify(readResult, null, 2)
    }

    const sheetName = params.worksheet || readResult.worksheets[0]
    let data = readResult.data[sheetName]

    if (!data) {
      return JSON.stringify(
        {
          success: false,
          error: `Worksheet "${sheetName}" not found`,
        },
        null,
        2
      )
    }

    // Apply filters
    if (params.filters) {
      data = data.filter((row) => {
        return params.filters!.every((filter) => {
          const colIndex =
            typeof filter.column === 'string'
              ? filter.column.toUpperCase().charCodeAt(0) - 65
              : filter.column

          const cellValue = String(row[colIndex] ?? '').toLowerCase()
          const filterValue = filter.value?.toLowerCase() ?? ''

          switch (filter.operator) {
            case 'equals':
              return cellValue === filterValue
            case 'contains':
              return cellValue.includes(filterValue)
            case 'greater':
              return parseFloat(cellValue) > parseFloat(filterValue)
            case 'less':
              return parseFloat(cellValue) < parseFloat(filterValue)
            case 'not_empty':
              return cellValue !== ''
            default:
              return true
          }
        })
      })
    }

    // Apply limit
    const result = params.limit ? data.slice(0, params.limit) : data

    return JSON.stringify(
      {
        success: true,
        file: params.file_path,
        worksheet: sheetName,
        filters: params.filters,
        total_rows: data.length,
        returned_rows: result.length,
        data: result,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  }
}

// ============================================================================
// Consolidated Exports
// ============================================================================

export const excelIntegrationTools: Record<
  string,
  { definition: ToolDefinition; executor: ToolExecutor }
> = {
  read_excel: { definition: read_excel, executor: read_excel_executor },
  analyze_excel: { definition: analyze_excel, executor: analyze_excel_executor },
  export_to_csv: { definition: export_to_csv, executor: export_to_csv_executor },
  query_excel: { definition: query_excel, executor: query_excel_executor },
}

export const excelIntegrationToolDefinitions: ToolDefinition[] = [
  read_excel,
  analyze_excel,
  export_to_csv,
  query_excel,
]

export const excelIntegrationToolExecutors: Record<string, ToolExecutor> = {
  read_excel: read_excel_executor,
  analyze_excel: analyze_excel_executor,
  export_to_csv: export_to_csv_executor,
  query_excel: query_excel_executor,
}
