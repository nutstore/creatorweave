/**
 * Data Exporter Service
 *
 * Handles data export in various formats:
 * - CSV for tabular data exchange
 * - JSON for structured data
 * - Excel for multi-sheet workbooks (with SheetJS)
 * - Images for charts and visualizations
 *
 * Features:
 * - Progress tracking for large exports
 * - Cancellation support
 * - Browser-native downloads via FileSaver
 *
 * @module data-exporter
 */

import { saveAs } from 'file-saver'

// ============================================================================
// Types
// ============================================================================

export type ExportFormat = 'csv' | 'json' | 'excel' | 'image'

export interface ExportOptions {
  /** Custom filename (without extension) */
  filename?: string
  /** Add timestamp to filename */
  addTimestamp?: boolean
  /** Export progress callback */
  onProgress?: (progress: number, status: string) => void
  /** Cancellation signal */
  signal?: AbortSignal
}

export interface ExcelExportOptions extends ExportOptions {
  /** Sheet name for Excel (default: 'Data') */
  sheetName?: string
  /** Create multiple sheets from array data */
  sheets?: Record<string, unknown[]>
}

export interface ExportResult {
  success: boolean
  filename: string
  size: number
  error?: string
}

// ============================================================================
// CSV Export
// ============================================================================

/**
 * Export data to CSV format
 *
 * @param data - Array of objects or 2D array
 * @param options - Export options
 * @returns Export result
 */
export async function exportToCSV(
  data: Record<string, unknown>[] | unknown[][],
  options: ExportOptions = {}
): Promise<ExportResult> {
  const { filename = 'export', addTimestamp = true, onProgress, signal } = options

  try {
    onProgress?.(10, 'Preparing data...')

    // Convert to CSV string
    const csv = Array.isArray(data) && data.length > 0 && !Array.isArray(data[0])
      ? objectToCSV(data as Record<string, unknown>[])
      : arrayToCSV(data as unknown[][])

    onProgress?.(50, 'Generating file...')

    if (signal?.aborted) {
      return { success: false, filename: '', size: 0, error: 'Export cancelled' }
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const finalFilename = buildFilename(filename, 'csv', addTimestamp)

    saveAs(blob, finalFilename)

    onProgress?.(100, 'Export complete')

    return {
      success: true,
      filename: finalFilename,
      size: blob.size,
    }
  } catch (error) {
    return {
      success: false,
      filename: '',
      size: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Convert array of objects to CSV string
 */
function objectToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return ''

  const headers = Object.keys(data[0])
  const rows = data.map((row) =>
    headers.map((header) => {
      const value = row[header]
      return formatCSVValue(value)
    }).join(',')
  )

  return [headers.map(formatCSVValue).join(','), ...rows].join('\n')
}

/**
 * Convert 2D array to CSV string
 */
function arrayToCSV(data: unknown[][]): string {
  if (data.length === 0) return ''

  return data
    .map((row) => row.map((cell) => formatCSVValue(cell)).join(','))
    .join('\n')
}

/**
 * Format a value for CSV output
 */
function formatCSVValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') {
    // Escape quotes and wrap in quotes if contains comma, newline, or quote
    const escaped = value.replace(/"/g, '""')
    if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
      return `"${escaped}"`
    }
    return escaped
  }
  return JSON.stringify(value)
}

// ============================================================================
// JSON Export
// ============================================================================

/**
 * Export data to JSON format
 *
 * @param data - Data to export
 * @param options - Export options
 * @returns Export result
 */
export async function exportToJSON(
  data: unknown,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const { filename = 'export', addTimestamp = true, onProgress, signal } = options

  try {
    onProgress?.(10, 'Preparing data...')

    const json = JSON.stringify(data, null, 2)

    onProgress?.(50, 'Generating file...')

    if (signal?.aborted) {
      return { success: false, filename: '', size: 0, error: 'Export cancelled' }
    }

    const blob = new Blob([json], { type: 'application/json' })
    const finalFilename = buildFilename(filename, 'json', addTimestamp)

    saveAs(blob, finalFilename)

    onProgress?.(100, 'Export complete')

    return {
      success: true,
      filename: finalFilename,
      size: blob.size,
    }
  } catch (error) {
    return {
      success: false,
      filename: '',
      size: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// Excel Export (Requires SheetJS)
// ============================================================================

/**
 * Export data to Excel format
 *
 * Note: Requires SheetJS (xlsx) library to be loaded
 *
 * @param data - Array of objects or sheets configuration
 * @param options - Excel export options
 * @returns Export result
 */
export async function exportToExcel(
  data: Record<string, unknown>[] | Record<string, unknown[]>,
  options: ExcelExportOptions = {}
): Promise<ExportResult> {
  const {
    filename = 'export',
    addTimestamp = true,
    onProgress,
    signal,
    sheetName = 'Data',
  } = options

  try {
    onProgress?.(10, 'Loading Excel library...')

    // Dynamic import for SheetJS
    const XLSX = await import('xlsx')

    onProgress?.(30, 'Preparing workbook...')

    if (signal?.aborted) {
      return { success: false, filename: '', size: 0, error: 'Export cancelled' }
    }

    const workbook = XLSX.utils.book_new()

    // Handle both single sheet and multiple sheets
    if (Array.isArray(data)) {
      const worksheet = XLSX.utils.json_to_sheet(data)
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
    } else {
      // Multiple sheets
      for (const [name, sheetData] of Object.entries(data)) {
        const worksheet = XLSX.utils.json_to_sheet(sheetData as Record<string, unknown>[])
        XLSX.utils.book_append_sheet(workbook, worksheet, name)
      }
    }

    onProgress?.(70, 'Generating file...')

    const finalFilename = buildFilename(filename, 'xlsx', addTimestamp)

    // Generate Excel file
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    saveAs(blob, finalFilename)

    onProgress?.(100, 'Export complete')

    return {
      success: true,
      filename: finalFilename,
      size: blob.size,
    }
  } catch (error) {
    // Check if it's a library not found error
    if (error instanceof Error && error.message.includes('xlsx')) {
      return {
        success: false,
        filename: '',
        size: 0,
        error: 'Excel export requires SheetJS library. Please install xlsx.',
      }
    }

    return {
      success: false,
      filename: '',
      size: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// Image Export
// ============================================================================

/**
 * Export chart/canvas to image format
 *
 * @param element - DOM element containing the chart
 * @param format - Output format (png or svg)
 * @param options - Export options
 * @returns Export result
 */
export async function exportToImage(
  element: HTMLElement,
  format: 'png' | 'svg' = 'png',
  options: ExportOptions = {}
): Promise<ExportResult> {
  const { filename = 'chart', addTimestamp = true, onProgress, signal } = options

  try {
    onProgress?.(20, 'Capturing element...')

    if (signal?.aborted) {
      return { success: false, filename: '', size: 0, error: 'Export cancelled' }
    }

    let blob: Blob

    if (format === 'svg') {
      // For SVG, we need to serialize the element
      const serializer = new XMLSerializer()
      const svgString = serializer.serializeToString(element)
      blob = new Blob([svgString], { type: 'image/svg+xml' })
    } else {
      // For PNG, use html2canvas-like approach
      const canvas = await html2canvas(element)

      if (signal?.aborted) {
        return { success: false, filename: '', size: 0, error: 'Export cancelled' }
      }

      blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas conversion failed'))),
          'image/png'
        )
      })
    }

    onProgress?.(70, 'Generating file...')

    const finalFilename = buildFilename(filename, format, addTimestamp)
    saveAs(blob, finalFilename)

    onProgress?.(100, 'Export complete')

    return {
      success: true,
      filename: finalFilename,
      size: blob.size,
    }
  } catch (error) {
    return {
      success: false,
      filename: '',
      size: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Simple html2canvas implementation using canvas API
 */
async function html2canvas(element: HTMLElement): Promise<HTMLCanvasElement> {
  // Create canvas with element dimensions
  const rect = element.getBoundingClientRect()
  const canvas = document.createElement('canvas')
  canvas.width = rect.width * window.devicePixelRatio
  canvas.height = rect.height * window.devicePixelRatio
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('Could not get canvas context')
  }

  // Scale for retina displays
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio)

  // Convert element to data URL using foreignObject SVG
  const data = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml">
          ${element.outerHTML}
        </div>
      </foreignObject>
    </svg>
  `

  const img = new Image()
  const svgBlob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve()
    }
    img.onerror = reject
    img.src = url
  })

  return canvas
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Build filename with optional timestamp
 */
function buildFilename(base: string, extension: string, addTimestamp: boolean): string {
  const timestamp = addTimestamp ? `_${Date.now()}` : ''
  return `${base}${timestamp}.${extension}`
}

/**
 * Detect best export format from data
 */
export function detectExportFormat(data: unknown): ExportFormat {
  if (Array.isArray(data)) {
    if (data.length === 0) return 'csv'
    const firstItem = data[0]
    if (typeof firstItem === 'object' && firstItem !== null) {
      return 'excel' // Structured data -> Excel
    }
    return 'csv' // Simple arrays -> CSV
  }
  return 'json' // Single object -> JSON
}

/**
 * Get recommended export format for data
 */
export function getRecommendedFormat(dataType: 'table' | 'hierarchical' | 'key-value'): ExportFormat {
  switch (dataType) {
    case 'table':
      return 'excel'
    case 'hierarchical':
      return 'json'
    case 'key-value':
      return 'csv'
    default:
      return 'csv'
  }
}
