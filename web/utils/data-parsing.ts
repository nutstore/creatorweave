/**
 * Data Parsing Utilities
 *
 * Provides utilities for parsing CSV and JSON files with type detection,
 * error handling, and data transformation capabilities.
 */

//=============================================================================
// Types
//=============================================================================

export type ColumnType = 'string' | 'number' | 'boolean' | 'date' | 'unknown'

export interface ColumnInfo {
  name: string
  type: ColumnType
  nullable: boolean
  unique: number
  examples: unknown[]
}

export interface ParsedData {
  headers: string[]
  rows: Record<string, unknown>[]
  columns: ColumnInfo[]
  rowCount: number
  columnCount: number
}

export interface DataStats {
  min?: number
  max?: number
  avg?: number
  sum?: number
  count: number
  nullCount: number
  unique: number
}

//=============================================================================
// CSV Parsing
//=============================================================================

/**
 * Parse CSV string into structured data
 * @param csvContent - Raw CSV content
 * @param options - Parsing options
 * @returns Parsed data with column information
 */
export function parseCSV(
  csvContent: string,
  options: {
    delimiter?: string
    hasHeader?: boolean
    skipEmptyRows?: boolean
  } = {}
): ParsedData {
  const { delimiter = ',', hasHeader = true, skipEmptyRows = true } = options

  // Normalize line endings
  const lines = csvContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => !skipEmptyRows || line.trim())

  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      columns: [],
      rowCount: 0,
      columnCount: 0,
    }
  }

  // Parse CSV lines handling quoted fields
  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"'
          i++
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes
        }
      } else if (char === delimiter && !inQuotes) {
        // Field delimiter
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }

    // Add last field
    result.push(current.trim())

    return result
  }

  // Extract headers
  const headerLine = lines[0]
  const headers = hasHeader ? parseLine(headerLine) : []

  // Parse data rows
  const dataLines = hasHeader ? lines.slice(1) : lines
  const rows: Record<string, unknown>[] = []

  for (const line of dataLines) {
    if (!line.trim()) continue

    const values = parseLine(line)
    const row: Record<string, unknown> = {}

    if (hasHeader) {
      headers.forEach((header, index) => {
        row[header] = values[index] ?? ''
      })
    } else {
      values.forEach((value, index) => {
        row[`col${index}`] = value
      })
    }

    rows.push(row)
  }

  // Detect column types
  const columns = detectColumnTypes(rows, headers)

  return {
    headers,
    rows,
    columns,
    rowCount: rows.length,
    columnCount: headers.length,
  }
}

//=============================================================================
// JSON Parsing
//=============================================================================

/**
 * Parse JSON content into structured data
 * @param jsonContent - Raw JSON content
 * @returns Parsed data with column information
 */
export function parseJSON(jsonContent: string): ParsedData {
  try {
    const parsed = JSON.parse(jsonContent)

    // Handle array of objects
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) {
        return {
          headers: [],
          rows: [],
          columns: [],
          rowCount: 0,
          columnCount: 0,
        }
      }

      // Check if array of objects
      if (typeof parsed[0] === 'object' && parsed[0] !== null) {
        const rows = parsed as Record<string, unknown>[]
        const headers = Object.keys(parsed[0])
        const columns = detectColumnTypes(rows, headers)

        return {
          headers,
          rows,
          columns,
          rowCount: rows.length,
          columnCount: headers.length,
        }
      }

      // Array of primitives
      const headers = ['value']
      const rows = parsed.map((value) => ({ value }))
      const columns = detectColumnTypes(rows, headers)

      return {
        headers,
        rows,
        columns,
        rowCount: rows.length,
        columnCount: 1,
      }
    }

    // Handle single object
    if (typeof parsed === 'object' && parsed !== null) {
      const headers = Object.keys(parsed)
      const rows = [parsed as Record<string, unknown>]
      const columns = detectColumnTypes(rows, headers)

      return {
        headers,
        rows,
        columns,
        rowCount: 1,
        columnCount: headers.length,
      }
    }

    throw new Error('JSON must be an object or array of objects')
  } catch (error) {
    throw new Error(
      `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

//=============================================================================
// Type Detection
//=============================================================================

/**
 * Detect column types and collect statistics
 * @param rows - Data rows
 * @param headers - Column headers
 * @returns Array of column information
 */
export function detectColumnTypes(
  rows: Record<string, unknown>[],
  headers: string[]
): ColumnInfo[] {
  return headers.map((header) => {
    const values = rows.map((row) => row[header]).filter((v) => v !== null && v !== undefined)

    if (values.length === 0) {
      return {
        name: header,
        type: 'unknown',
        nullable: true,
        unique: 0,
        examples: [],
      }
    }

    // Detect type
    const type = detectValueType(values)

    // Count unique values
    const unique = new Set(values).size

    // Get examples (first 5 unique values)
    const examples = Array.from(new Set(values)).slice(0, 5)

    // Check if nullable
    const nullable = rows.some((row) => row[header] === null || row[header] === undefined)

    return {
      name: header,
      type,
      nullable,
      unique,
      examples,
    }
  })
}

/**
 * Detect the type of a value array
 * @param values - Array of values
 * @returns Detected column type
 */
function detectValueType(values: unknown[]): ColumnType {
  if (values.length === 0) return 'unknown'

  const typeCounts = {
    number: 0,
    boolean: 0,
    date: 0,
    string: 0,
  }

  for (const value of values) {
    const type = getValueType(value)
    typeCounts[type]++
  }

  // Determine dominant type (>80%)
  const threshold = values.length * 0.8
  if (typeCounts.number >= threshold) return 'number'
  if (typeCounts.boolean >= threshold) return 'boolean'
  if (typeCounts.date >= threshold) return 'date'

  return 'string'
}

/**
 * Get the type of a single value
 * @param value - Value to check
 * @returns Value type
 */
function getValueType(value: unknown): 'number' | 'boolean' | 'date' | 'string' {
  if (typeof value === 'number' && !isNaN(value)) return 'number'
  if (typeof value === 'boolean') return 'boolean'

  if (typeof value === 'string') {
    // Try to parse as number
    if (/^-?\d+\.?\d*$/.test(value.trim())) {
      const num = parseFloat(value)
      if (!isNaN(num)) return 'number'
    }

    // Try to parse as date
    const date = new Date(value)
    if (!isNaN(date.getTime()) && value.match(/^\d{4}-\d{2}-\d{2}/)) {
      return 'date'
    }

    // Check for boolean strings
    if (['true', 'false'].includes(value.toLowerCase())) return 'boolean'
  }

  return 'string'
}

//=============================================================================
// Data Statistics
//=============================================================================

/**
 * Calculate statistics for a column
 * @param rows - Data rows
 * @param columnName - Column name
 * @returns Column statistics
 */
export function calculateColumnStats(
  rows: Record<string, unknown>[],
  columnName: string
): DataStats {
  const values = rows.map((row) => row[columnName]).filter((v) => v !== null && v !== undefined)

  const nullCount = rows.length - values.length
  const unique = new Set(values).size

  // Try to parse as numbers
  const numbers = values
    .map((v) => (typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN))
    .filter((n) => !isNaN(n))

  if (numbers.length > 0) {
    const sum = numbers.reduce((a, b) => a + b, 0)
    const avg = sum / numbers.length
    const min = Math.min(...numbers)
    const max = Math.max(...numbers)

    return {
      min,
      max,
      avg,
      sum,
      count: numbers.length,
      nullCount,
      unique,
    }
  }

  return {
    count: values.length,
    nullCount,
    unique,
  }
}

/**
 * Calculate statistics for all columns
 * @param data - Parsed data
 * @returns Map of column name to statistics
 */
export function calculateAllStats(data: ParsedData): Map<string, DataStats> {
  const stats = new Map<string, DataStats>()

  for (const column of data.columns) {
    stats.set(column.name, calculateColumnStats(data.rows, column.name))
  }

  return stats
}

//=============================================================================
// Data Filtering
//=============================================================================

/**
 * Filter data rows based on criteria
 * @param rows - Data rows
 * @param filters - Filter criteria
 * @returns Filtered rows
 */
export function filterData(
  rows: Record<string, unknown>[],
  filters: Array<{
    column: string
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'startsWith' | 'endsWith'
    value: unknown
  }>
): Record<string, unknown>[] {
  return rows.filter((row) => {
    return filters.every((filter) => {
      const rowValue = row[filter.column]
      const filterValue = filter.value

      switch (filter.operator) {
        case 'eq':
          return rowValue === filterValue
        case 'ne':
          return rowValue !== filterValue
        case 'gt': {
          const rowNum =
            typeof rowValue === 'number'
              ? rowValue
              : typeof rowValue === 'string'
                ? parseFloat(rowValue)
                : NaN
          const filterNum =
            typeof filterValue === 'number'
              ? filterValue
              : typeof filterValue === 'string'
                ? parseFloat(filterValue)
                : NaN
          return !isNaN(rowNum) && !isNaN(filterNum) && rowNum > filterNum
        }
        case 'lt': {
          const rowNum =
            typeof rowValue === 'number'
              ? rowValue
              : typeof rowValue === 'string'
                ? parseFloat(rowValue)
                : NaN
          const filterNum =
            typeof filterValue === 'number'
              ? filterValue
              : typeof filterValue === 'string'
                ? parseFloat(filterValue)
                : NaN
          return !isNaN(rowNum) && !isNaN(filterNum) && rowNum < filterNum
        }
        case 'gte': {
          const rowNum =
            typeof rowValue === 'number'
              ? rowValue
              : typeof rowValue === 'string'
                ? parseFloat(rowValue)
                : NaN
          const filterNum =
            typeof filterValue === 'number'
              ? filterValue
              : typeof filterValue === 'string'
                ? parseFloat(filterValue)
                : NaN
          return !isNaN(rowNum) && !isNaN(filterNum) && rowNum >= filterNum
        }
        case 'lte': {
          const rowNum =
            typeof rowValue === 'number'
              ? rowValue
              : typeof rowValue === 'string'
                ? parseFloat(rowValue)
                : NaN
          const filterNum =
            typeof filterValue === 'number'
              ? filterValue
              : typeof filterValue === 'string'
                ? parseFloat(filterValue)
                : NaN
          return !isNaN(rowNum) && !isNaN(filterNum) && rowNum <= filterNum
        }
        case 'contains':
          return (
            typeof rowValue === 'string' &&
            typeof filterValue === 'string' &&
            rowValue.includes(filterValue)
          )
        case 'startsWith':
          return (
            typeof rowValue === 'string' &&
            typeof filterValue === 'string' &&
            rowValue.startsWith(filterValue)
          )
        case 'endsWith':
          return (
            typeof rowValue === 'string' &&
            typeof filterValue === 'string' &&
            rowValue.endsWith(filterValue)
          )
        default:
          return true
      }
    })
  })
}

//=============================================================================
// Data Aggregation
//=============================================================================

/**
 * Aggregate data by grouping column
 * @param rows - Data rows
 * @param groupBy - Column to group by
 * @param aggregations - Aggregation functions for columns
 * @returns Aggregated data
 */
export function aggregateData(
  rows: Record<string, unknown>[],
  groupBy: string,
  aggregations: Record<string, 'count' | 'sum' | 'avg' | 'min' | 'max'>
): Record<string, unknown>[] {
  const groups = new Map<string, Record<string, unknown>[]>()

  // Group rows
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'null')
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(row)
  }

  // Calculate aggregations
  const result: Record<string, unknown>[] = []

  for (const [key, groupRows] of groups) {
    const aggregated: Record<string, unknown> = {
      [groupBy]: key,
    }

    for (const [targetColumn, operation] of Object.entries(aggregations)) {
      if (operation === 'count') {
        aggregated[targetColumn] = groupRows.length
      } else {
        // Extract source column name from target column name
        // e.g., "value_sum" -> "value", "total_avg" -> "total"
        // If no suffix is found, use the target column name as-is
        const suffixMatch = targetColumn.match(/_(sum|avg|min|max)$/)
        const sourceColumn = suffixMatch
          ? targetColumn.substring(0, targetColumn.lastIndexOf('_'))
          : targetColumn

        // Parse values as numbers (handle both number and string types)
        const values = groupRows
          .map((r) => {
            const val = r[sourceColumn]
            if (typeof val === 'number') return val
            if (typeof val === 'string') {
              const parsed = parseFloat(val)
              return isNaN(parsed) ? null : parsed
            }
            return null
          })
          .filter((v): v is number => v !== null)

        if (values.length === 0) {
          aggregated[targetColumn] = null
        } else {
          switch (operation) {
            case 'sum':
              aggregated[targetColumn] = values.reduce((a, b) => a + b, 0)
              break
            case 'avg':
              aggregated[targetColumn] = values.reduce((a, b) => a + b, 0) / values.length
              break
            case 'min':
              aggregated[targetColumn] = Math.min(...values)
              break
            case 'max':
              aggregated[targetColumn] = Math.max(...values)
              break
          }
        }
      }
    }

    result.push(aggregated)
  }

  return result
}

//=============================================================================
// Data Export
//=============================================================================

/**
 * Export data to CSV format
 * @param data - Parsed data
 * @returns CSV string
 */
export function exportToCSV(data: ParsedData): string {
  const headers = data.headers
  const rows = data.rows

  // Create header row
  const csvRows = [headers.join(',')]

  // Create data rows
  for (const row of rows) {
    const values = headers.map((header) => {
      const value = row[header]
      if (value === null || value === undefined) return ''

      // Escape quotes and wrap in quotes if contains comma or quote
      const strValue = String(value)
      if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
        return `"${strValue.replace(/"/g, '""')}"`
      }
      return strValue
    })

    csvRows.push(values.join(','))
  }

  return csvRows.join('\n')
}

/**
 * Export data to JSON format
 * @param data - Parsed data
 * @param pretty - Pretty print JSON
 * @returns JSON string
 */
export function exportToJSON(data: ParsedData, pretty = true): string {
  return pretty ? JSON.stringify(data.rows, null, 2) : JSON.stringify(data.rows)
}
