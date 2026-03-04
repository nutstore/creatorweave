/**
 * DataPreview - Data preview component with tabular view
 *
 * Features:
 * - Tabular view for CSV/JSON data
 * - Column type detection
 * - Basic statistics (min, max, avg, count)
 * - Search within data
 * - Sorting and pagination
 */

import { useState, useMemo } from 'react'
import {
  Search,
  ArrowUpDown,
  Info,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
} from 'lucide-react'
import {
  parseCSV,
  parseJSON,
  calculateAllStats,
  exportToCSV,
  exportToJSON,
  type ColumnInfo,
  type DataStats,
  type ColumnType,
} from '@/utils/data-parsing'

//=============================================================================
// Types
//=============================================================================

interface DataPreviewProps {
  data: string
  fileType: 'csv' | 'json'
  onError?: (error: string) => void
}

//=============================================================================
// Components
//=============================================================================

// Column type badge color
function getTypeColor(type: ColumnType): string {
  switch (type) {
    case 'number':
      return 'bg-blue-100 text-blue-700'
    case 'string':
      return 'bg-green-100 text-green-700'
    case 'boolean':
      return 'bg-purple-100 text-purple-700'
    case 'date':
      return 'bg-orange-100 text-orange-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

// Statistics panel
function StatsPanel({ columns, stats }: { columns: ColumnInfo[]; stats: Map<string, DataStats> }) {
  return (
    <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
      <div className="mb-3 flex items-center gap-2">
        <Info className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
        <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-200">Column Statistics</h4>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {columns.map((column) => {
          const colStats = stats.get(column.name)
          if (!colStats) return null

          return (
            <div
              key={column.name}
              className="rounded-md border border-neutral-200 bg-white p-3 text-xs dark:border-neutral-700 dark:bg-neutral-900"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{column.name}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getTypeColor(column.type)}`}
                >
                  {column.type}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-neutral-600 dark:text-neutral-300">
                <div>
                  <span className="text-neutral-400">Count:</span>{' '}
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">{colStats.count}</span>
                </div>
                <div>
                  <span className="text-neutral-400">Unique:</span>{' '}
                  <span className="font-medium text-neutral-700 dark:text-neutral-200">{colStats.unique}</span>
                </div>

                {colStats.min !== undefined && (
                  <div>
                    <span className="text-neutral-400">Min:</span>{' '}
                    <span className="font-medium text-neutral-700 dark:text-neutral-200">
                      {typeof colStats.min === 'number' ? colStats.min.toFixed(2) : colStats.min}
                    </span>
                  </div>
                )}
                {colStats.max !== undefined && (
                  <div>
                    <span className="text-neutral-400">Max:</span>{' '}
                    <span className="font-medium text-neutral-700 dark:text-neutral-200">
                      {typeof colStats.max === 'number' ? colStats.max.toFixed(2) : colStats.max}
                    </span>
                  </div>
                )}
                {colStats.avg !== undefined && (
                  <div>
                    <span className="text-neutral-400">Avg:</span>{' '}
                    <span className="font-medium text-neutral-700 dark:text-neutral-200">{colStats.avg.toFixed(2)}</span>
                  </div>
                )}
                {colStats.sum !== undefined && (
                  <div>
                    <span className="text-neutral-400">Sum:</span>{' '}
                    <span className="font-medium text-neutral-700 dark:text-neutral-200">{colStats.sum.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {colStats.nullCount > 0 && (
                <div className="mt-2 text-neutral-500 dark:text-neutral-400">
                  <span className="text-neutral-400">Null:</span> {colStats.nullCount} values
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Main DataPreview component
export function DataPreview({ data, fileType, onError }: DataPreviewProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage] = useState(50)
  const [showStats, setShowStats] = useState(true)

  // Parse data
  const parsedData = useMemo(() => {
    try {
      if (fileType === 'csv') {
        return parseCSV(data)
      } else {
        return parseJSON(data)
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to parse data')
      return null
    }
  }, [data, fileType, onError])

  // Calculate statistics
  const stats = useMemo(() => {
    if (!parsedData) return new Map()
    return calculateAllStats(parsedData)
  }, [parsedData])

  // Filter and sort data
  const filteredSortedData = useMemo(() => {
    if (!parsedData) return []

    let result = [...parsedData.rows]

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((row) =>
        parsedData.headers.some((col) =>
          String(row[col] || '')
            .toLowerCase()
            .includes(query)
        )
      )
    }

    // Apply sort
    if (sortColumn) {
      result.sort((a, b) => {
        const aVal = a[sortColumn]
        const bVal = b[sortColumn]
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
        }
        const aStr = String(aVal || '')
        const bStr = String(bVal || '')
        return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
      })
    }

    return result
  }, [parsedData, searchQuery, sortColumn, sortDirection])

  // Pagination
  const totalPages = Math.ceil(filteredSortedData.length / rowsPerPage)
  const paginatedData = filteredSortedData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  )

  // Handle sort
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // Handle export
  const handleExport = async (format: 'csv' | 'json') => {
    if (!parsedData) return

    try {
      let content: string
      let filename: string
      let mimeType: string

      if (format === 'csv') {
        content = exportToCSV(parsedData)
        filename = 'data.csv'
        mimeType = 'text/csv'
      } else {
        content = exportToJSON(parsedData, true)
        filename = 'data.json'
        mimeType = 'application/json'
      }

      // Create download
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to export data')
    }
  }

  if (!parsedData) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
        Failed to parse data
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Data Preview</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {parsedData.rowCount} rows × {parsedData.columnCount} columns
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowStats(!showStats)}
            className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Filter className="h-4 w-4" />
            {showStats ? 'Hide' : 'Show'} Stats
          </button>

          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Export as CSV"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>

          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            title="Export as JSON"
          >
            <Download className="h-4 w-4" />
            JSON
          </button>
        </div>
      </div>

      {/* Statistics Panel */}
      {showStats && <StatsPanel columns={parsedData.columns} stats={stats} />}

      {/* Search and Filter Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            placeholder="Search data..."
            className="focus:border-primary-300 w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:bg-neutral-900"
          />
        </div>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          {filteredSortedData.length} row{filteredSortedData.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Data Table */}
      <div className="max-h-[500px] overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50 dark:bg-neutral-800">
            <tr>
              {parsedData.headers.map((column) => {
                const columnInfo = parsedData.columns.find((c) => c.name === column)
                return (
                  <th
                    key={column}
                    onClick={() => handleSort(column)}
                    className="cursor-pointer select-none px-4 py-3 text-left font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  >
                    <div className="flex items-center gap-2">
                      <span>{column}</span>
                      {columnInfo && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getTypeColor(columnInfo.type)}`}
                        >
                          {columnInfo.type}
                        </span>
                      )}
                      {sortColumn === column ? (
                        sortDirection === 'asc' ? (
                          <ArrowUpDown className="h-4 w-4 text-primary-600" />
                        ) : (
                          <ArrowUpDown className="h-4 w-4 rotate-180 text-primary-600" />
                        )
                      ) : (
                        <ArrowUpDown className="h-4 w-4 text-neutral-400" />
                      )}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {paginatedData.map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                {parsedData.headers.map((column) => (
                  <td key={column} className="whitespace-nowrap px-4 py-3 text-neutral-700 dark:text-neutral-300">
                    {row[column] === null || row[column] === undefined ? '' : String(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {paginatedData.length === 0 && (
          <div className="py-8 text-center text-neutral-500 dark:text-neutral-400">No data found</div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-neutral-500 dark:text-neutral-400">
            Showing {(currentPage - 1) * rowsPerPage + 1} to{' '}
            {Math.min(currentPage * rowsPerPage, filteredSortedData.length)} of{' '}
            {filteredSortedData.length}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-neutral-200 bg-white p-2 text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="text-sm text-neutral-700 dark:text-neutral-300">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-neutral-200 bg-white p-2 text-neutral-600 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
