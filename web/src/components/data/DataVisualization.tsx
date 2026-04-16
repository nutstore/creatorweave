/* eslint-disable react-refresh/only-export-components */
/**
 * DataVisualization - Data visualization component
 *
 * Supports:
 * - Python matplotlib generated images
 * - Data tables (with sorting, filtering)
 * - Simple stat charts (bar, line, pie)
 * - Chart export functionality
 * - Chart.js integration
 */

import { useState, useMemo, useRef } from 'react'
import { X, Download, Maximize2, ChevronDown, ChevronUp, Search, BarChart3 } from 'lucide-react'
import { Chart as ChartJS, type ChartData, type ChartOptions } from 'chart.js/auto'
import { Chart } from 'react-chartjs-2'

//=============================================================================
// Types
//=============================================================================

export type VisualizationType = 'image' | 'table' | 'bar' | 'line' | 'pie' | 'scatter' | 'stats'

export interface VisualizationData {
  type: VisualizationType
  title?: string
  // Image data (base64 or URL)
  imageData?: string
  imageFilename?: string
  // Table data
  tableData?: Record<string, unknown>[] | string[][]
  tableColumns?: string[]
  // Chart data
  chartData?: ChartDataPoint[] | Record<string, unknown>[]
  // Chart options
  chartOptions?: {
    xAxis?: string
    yAxis?: string
    colorBy?: string
  }
  // Stats
  stats?: Record<string, number>
}

interface ChartDataPoint {
  label: string
  value: number
  category?: string
  x?: number
  y?: number
}

interface DataVisualizationProps {
  data: VisualizationData
  onClose?: () => void
  onExport?: () => void
}

//=============================================================================
// Sub Components
//=============================================================================

// Image Display
function ImageViewer({
  src,
  filename,
  onExport,
}: {
  src: string
  filename?: string
  onExport?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="max-w-full overflow-auto rounded-lg border border bg-card p-4 dark:border-border dark:bg-card">
        <img src={src} alt={filename || 'Chart'} className="h-auto max-w-full" loading="lazy" />
      </div>
      {filename && <p className="text-sm text-tertiary dark:text-muted">{filename}</p>}
      {onExport && (
        <button
          onClick={onExport}
          className="flex items-center gap-2 rounded-lg border border bg-card px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted dark:border-border dark:bg-card dark:text-muted dark:hover:bg-muted"
        >
          <Download className="h-4 w-4" />
          Export Image
        </button>
      )}
    </div>
  )
}

// Table Viewer with sorting and filtering
function TableViewer({
  data,
  columns,
}: {
  data: Record<string, unknown>[] | string[][]
  columns?: string[]
}) {
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [searchQuery, setSearchQuery] = useState('')

  // Normalize data to array of objects
  const normalizedData = useMemo(() => {
    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
      // Convert string[][] to object[]
      const firstRow = data[0] as unknown[]
      const cols = columns || (Array.isArray(firstRow) ? firstRow.map((_, i) => `col${i}`) : [])
      return (data as string[][]).map((row) => {
        const obj: Record<string, unknown> = {}
        row.forEach((val, idx) => {
          obj[cols[idx] || `col${idx}`] = val
        })
        return obj
      })
    }
    return data as Record<string, unknown>[]
  }, [data, columns])

  // Get columns from data
  const tableColumns = useMemo(() => {
    if (columns) return columns
    if (normalizedData.length > 0) {
      return Object.keys(normalizedData[0])
    }
    return []
  }, [columns, normalizedData])

  // Filter and sort data
  const filteredSortedData = useMemo(() => {
    let result = [...normalizedData]

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((row) =>
        tableColumns.some((col) =>
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
  }, [normalizedData, tableColumns, searchQuery, sortColumn, sortDirection])

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  // Limit display rows for performance
  const displayData = filteredSortedData.slice(0, 100)
  const hasMore = filteredSortedData.length > 100

  return (
    <div className="w-full">
      {/* Controls */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search table..."
            className="focus:border-primary-300 w-full rounded-lg border border bg-muted py-2 pl-10 pr-4 text-sm focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-border dark:bg-muted dark:text-primary-foreground dark:placeholder:text-muted dark:focus:bg-card"
          />
        </div>
        <span className="text-sm text-tertiary dark:text-muted">
          {filteredSortedData.length} row{filteredSortedData.length !== 1 ? 's' : ''}
          {hasMore && ` (showing first 100)`}
        </span>
      </div>

      {/* Table */}
      <div className="max-h-[400px] overflow-auto rounded-lg border border dark:border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted dark:bg-muted">
            <tr>
              {tableColumns.map((column) => (
                <th
                  key={column}
                  onClick={() => handleSort(column)}
                  className="cursor-pointer select-none px-4 py-3 text-left font-medium text-secondary transition-colors hover:bg-muted dark:text-muted dark:hover:bg-muted"
                >
                  <div className="flex items-center gap-2">
                    <span>{column}</span>
                    {sortColumn === column ? (
                      sortDirection === 'asc' ? (
                        <ChevronUp className="h-4 w-4 text-primary-600" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-primary-600" />
                      )
                    ) : (
                      <ChevronDown className="h-4 w-4 text-tertiary" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border dark:divide-border">
            {displayData.map((row, idx) => (
              <tr key={idx} className="hover:bg-muted dark:hover:bg-muted">
                {tableColumns.map((column) => (
                  <td key={column} className="whitespace-nowrap px-4 py-3 text-secondary dark:text-muted">
                    {String(row[column] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {displayData.length === 0 && (
          <div className="py-8 text-center text-tertiary dark:text-muted">No data found</div>
        )}
      </div>
    </div>
  )
}

// Chart.js Bar Chart
function ChartBarChart({ data }: { data: ChartDataPoint[] }) {
  const chartRef = useRef<ChartJS<'bar'>>(null)

  const chartData: ChartData<'bar'> = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: 'Value',
        data: data.map((d) => d.value),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      },
    ],
  }

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.y}: ${context.label}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  }

  const handleExport = () => {
    const chart = chartRef.current
    if (chart) {
      const url = chart.toBase64Image()
      const a = document.createElement('a')
      a.href = url
      a.download = 'bar-chart.png'
      a.click()
    }
  }

  return (
    <div className="flex h-96 w-full flex-col gap-4">
      <div className="flex-1">
        <Chart ref={chartRef} type="bar" data={chartData} options={options} />
      </div>
      <button
        onClick={handleExport}
        className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted dark:border-border dark:bg-muted dark:text-muted dark:hover:bg-neutral-800"
      >
        <Download className="h-4 w-4" />
        Export Chart
      </button>
    </div>
  )
}

// Chart.js Line Chart
function ChartLineChart({ data }: { data: ChartDataPoint[] }) {
  const chartRef = useRef<ChartJS<'line'>>(null)

  const chartData: ChartData<'line'> = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: 'Value',
        data: data.map((d) => d.value),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
      },
    ],
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  }

  const handleExport = () => {
    const chart = chartRef.current
    if (chart) {
      const url = chart.toBase64Image()
      const a = document.createElement('a')
      a.href = url
      a.download = 'line-chart.png'
      a.click()
    }
  }

  return (
    <div className="flex h-96 w-full flex-col gap-4">
      <div className="flex-1">
        <Chart ref={chartRef} type="line" data={chartData} options={options} />
      </div>
      <button
        onClick={handleExport}
        className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted dark:border-border dark:bg-muted dark:text-muted dark:hover:bg-neutral-800"
      >
        <Download className="h-4 w-4" />
        Export Chart
      </button>
    </div>
  )
}

// Chart.js Pie Chart
function ChartPieChart({ data }: { data: ChartDataPoint[] }) {
  const chartRef = useRef<ChartJS<'pie'>>(null)

  const colors = [
    'rgba(59, 130, 246, 0.7)',
    'rgba(16, 185, 129, 0.7)',
    'rgba(245, 158, 11, 0.7)',
    'rgba(239, 68, 68, 0.7)',
    'rgba(139, 92, 246, 0.7)',
    'rgba(236, 72, 153, 0.7)',
    'rgba(14, 165, 233, 0.7)',
    'rgba(168, 85, 247, 0.7)',
  ]

  const borderColors = colors.map((c) => c.replace('0.7', '1'))

  const chartData: ChartData<'pie'> = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        data: data.map((d) => d.value),
        backgroundColor: colors.slice(0, data.length),
        borderColor: borderColors.slice(0, data.length),
        borderWidth: 1,
      },
    ],
  }

  const options: ChartOptions<'pie'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
      },
    },
  }

  const handleExport = () => {
    const chart = chartRef.current
    if (chart) {
      const url = chart.toBase64Image()
      const a = document.createElement('a')
      a.href = url
      a.download = 'pie-chart.png'
      a.click()
    }
  }

  return (
    <div className="flex h-96 w-full flex-col gap-4">
      <div className="flex-1">
        <Chart ref={chartRef} type="pie" data={chartData} options={options} />
      </div>
      <button
        onClick={handleExport}
        className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted dark:border-border dark:bg-muted dark:text-muted dark:hover:bg-neutral-800"
      >
        <Download className="h-4 w-4" />
        Export Chart
      </button>
    </div>
  )
}

// Chart.js Scatter Chart
function ChartScatterChart({ data }: { data: ChartDataPoint[] }) {
  const chartRef = useRef<ChartJS<'scatter'>>(null)

  const scatterData = data
    .filter((d) => d.x !== undefined && d.y !== undefined)
    .map((d) => ({ x: d.x!, y: d.y! }))

  const chartData: ChartData<'scatter'> = {
    datasets: [
      {
        label: 'Data Points',
        data: scatterData,
        backgroundColor: 'rgba(59, 130, 246, 0.7)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
      },
    ],
  }

  const options: ChartOptions<'scatter'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
    },
    scales: {
      x: {
        type: 'linear' as const,
        position: 'bottom' as const,
      },
    },
  }

  const handleExport = () => {
    const chart = chartRef.current
    if (chart) {
      const url = chart.toBase64Image()
      const a = document.createElement('a')
      a.href = url
      a.download = 'scatter-chart.png'
      a.click()
    }
  }

  return (
    <div className="flex h-96 w-full flex-col gap-4">
      <div className="flex-1">
        <Chart ref={chartRef} type="scatter" data={chartData} options={options} />
      </div>
      <button
        onClick={handleExport}
        className="flex items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-muted dark:border-border dark:bg-muted dark:text-muted dark:hover:bg-neutral-800"
      >
        <Download className="h-4 w-4" />
        Export Chart
      </button>
    </div>
  )
}

// Simple Stats Display
function StatsViewer({ stats }: { stats: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Object.entries(stats).map(([key, value]) => (
        <div
          key={key}
          className="rounded-xl border border-border bg-muted p-4 text-center dark:border-border dark:bg-neutral-800"
        >
          <p className="text-sm font-medium capitalize text-secondary dark:text-muted">{key}</p>
          <p className="mt-1 text-2xl font-semibold text-primary-600">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
      ))}
    </div>
  )
}

//=============================================================================
// Main Component
//=============================================================================

export function DataVisualization({ data, onClose, onExport }: DataVisualizationProps) {
  const [viewMode, setViewMode] = useState<'embedded' | 'fullscreen'>('embedded')

  const renderContent = () => {
    switch (data.type) {
      case 'image':
        if (!data.imageData) return null
        return (
          <ImageViewer src={data.imageData} filename={data.imageFilename} onExport={onExport} />
        )

      case 'table':
        if (!data.tableData) return null
        return <TableViewer data={data.tableData} columns={data.tableColumns} />

      case 'bar':
        if (!data.chartData) return null
        return <ChartBarChart data={data.chartData as ChartDataPoint[]} />

      case 'line':
        if (!data.chartData) return null
        return <ChartLineChart data={data.chartData as ChartDataPoint[]} />

      case 'pie':
        if (!data.chartData) return null
        return <ChartPieChart data={data.chartData as ChartDataPoint[]} />

      case 'scatter':
        if (!data.chartData) return null
        return <ChartScatterChart data={data.chartData as ChartDataPoint[]} />

      case 'stats':
        if (!data.stats) return null
        return <StatsViewer stats={data.stats} />

      default:
        return (
          <div className="py-8 text-center text-tertiary dark:text-muted">
            <BarChart3 className="mx-auto mb-4 h-12 w-12 text-tertiary dark:text-muted" />
            <p>Unsupported visualization type</p>
          </div>
        )
    }
  }

  return (
    <div
      className={`rounded-2xl bg-white shadow-xl dark:bg-card ${
        viewMode === 'fullscreen' ? 'fixed inset-4 z-50 flex flex-col' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border border-border dark:border-border px-6 py-4 dark:border-border">
        <div>
          <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">{data.title || 'Data Visualization'}</h3>
          <p className="mt-0.5 text-sm capitalize text-tertiary dark:text-muted">
            {data.type} {data.type === 'image' && data.imageFilename && `• ${data.imageFilename}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'embedded' ? 'fullscreen' : 'embedded')}
            className="rounded-lg p-2 text-tertiary transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-muted dark:hover:bg-neutral-800"
            title={viewMode === 'embedded' ? 'Fullscreen' : 'Exit fullscreen'}
          >
            <Maximize2 className="h-5 w-5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-tertiary transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-muted dark:hover:bg-neutral-800"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`p-6 ${viewMode === 'fullscreen' ? 'flex-1 overflow-auto' : ''}`}>
        {renderContent()}
      </div>
    </div>
  )
}

//=============================================================================
// Helper: Extract visualization from Python tool result
//=============================================================================

export function extractVisualizationFromPythonResult(result: {
  images?: Array<{ filename: string; data: string }>
  stdout?: string
  stderr?: string
}): VisualizationData | null {
  // Check for matplotlib images
  if (result.images && result.images.length > 0) {
    return {
      type: 'image',
      imageData: result.images[0].data,
      imageFilename: result.images[0].filename,
      title: 'Generated Chart',
    }
  }

  // Check for table-like output in stdout
  if (result.stdout) {
    // Try to parse as JSON
    try {
      const parsed = JSON.parse(result.stdout)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Check if it's an array of objects (table-like)
        if (typeof parsed[0] === 'object' && !Array.isArray(parsed[0])) {
          return {
            type: 'table',
            tableData: parsed as Record<string, unknown>[],
            title: 'Data Table',
          }
        }
        // Check if it's an array of arrays (table-like)
        if (Array.isArray(parsed[0])) {
          return {
            type: 'table',
            tableData: parsed as string[][],
            title: 'Data Table',
          }
        }
      }
    } catch {
      // Not JSON, check for table pattern
      const lines = result.stdout.trim().split('\n')
      if (lines.length > 2) {
        // Might be a tabular output
        return {
          type: 'table',
          tableData: lines.map((line) => line.split(/\s{2,}|\t/)),
          title: 'Data Table',
        }
      }
    }
  }

  return null
}
