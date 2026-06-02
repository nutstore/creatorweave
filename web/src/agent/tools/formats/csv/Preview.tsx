/**
 * CsvPreview - Render CSV files using Univer (same as XLSX preview).
 *
 * Strategy:
 *   1. Parse CSV with SheetJS → get 2D array data
 *   2. Build Univer IWorkbookData directly from the 2D array
 *   3. ≤30,000 rows → Univer Canvas rendering (full spreadsheet UX)
 *   4. >30,000 rows → degraded message with python hint
 *   5. If Univer/SheetJS fails → fallback to simple HTML table
 */

import { useState, useEffect, useRef } from 'react'
import { FileText, AlertCircle, Loader2, Table } from 'lucide-react'
import { formatBytes } from '@/lib/utils'

// Univer CSS (static imports — Vite handles these at build time)
import '@univerjs/preset-sheets-core/lib/index.css'
import '@univerjs/preset-sheets-drawing/lib/index.css'

// ── Constants ─────────────────────────────────────────────────────────────

/** Row threshold: above this, don't try to render in Univer */
const MAX_ROWS_FOR_RENDER = 30000

// ── Types ─────────────────────────────────────────────────────────────────

type PreviewState =
  | { status: 'parsing' }
  | { status: 'degraded'; totalRows: number }
  | { status: 'ready' }
  | { status: 'fallback'; headers: string[]; rows: string[][] }
  | { status: 'error'; message: string }

// ── Simple CSV Parser (for fallback HTML table) ───────────────────────────

function detectDelimiter(firstLine: string): string {
  const candidates = [
    { char: ',', count: 0 },
    { char: '\t', count: 0 },
    { char: ';', count: 0 },
    { char: '|', count: 0 },
  ]
  let inQuotes = false
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < firstLine.length && firstLine[i + 1] === '"') {
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (!inQuotes) {
      for (const c of candidates) {
        if (ch === c.char) c.count++
      }
    }
  }
  const sorted = candidates.filter(c => c.count > 0).sort((a, b) => b.count - a.count)
  return sorted.length > 0 ? sorted[0].char : ','
}

function parseCsvLine(line: string, delimiter: string): string[] | null {
  const fields: string[] = []
  let i = 0
  let current = ''
  let inQuotes = false
  while (i < line.length) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i += 2
        } else {
          inQuotes = false
          i++
        }
      } else {
        current += ch
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === delimiter) {
        fields.push(current)
        current = ''
        i++
      } else if (ch === '\r') {
        i++
      } else if (ch === '\n') {
        break
      } else {
        current += ch
        i++
      }
    }
  }
  fields.push(current)
  if (inQuotes) return null
  return fields
}

function parseCsvForFallback(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n')
  let startIdx = 0
  while (startIdx < lines.length && lines[startIdx].trim() === '') startIdx++
  if (startIdx >= lines.length) return { headers: [], rows: [] }

  const delimiter = detectDelimiter(lines[startIdx])
  const allRows: string[][] = []
  let buffer = ''

  for (let i = startIdx; i < lines.length; i++) {
    buffer = buffer ? buffer + '\n' + lines[i] : lines[i]
    const parsed = parseCsvLine(buffer, delimiter)
    if (parsed === null) continue
    const trimmedFields = parsed.map(f => f.trim())
    if (trimmedFields.every(f => f === '') && allRows.length > 0) continue
    allRows.push(parsed)
    buffer = ''
  }

  if (allRows.length === 0) return { headers: [], rows: [] }
  const headers = allRows[0].map((v, i) => v.trim() !== '' ? v.trim() : `Col ${i + 1}`)
  const rows = allRows.slice(1)
  return { headers, rows }
}

/** Max rows to render in the fallback HTML table (performance guard) */
const MAX_FALLBACK_ROWS = 5000

// ── Build Univer workbook data from 2D array ──────────────────────────────

/**
 * Build IWorkbookData directly from a 2D string array.
 * This avoids the unreliable CSV→xlsx→Univer round-trip.
 */
function buildUniverData(rawRows: string[][], sheetName: string): any {
  const maxCols = rawRows.reduce((m, r) => Math.max(m, r.length), 0)
  const cellData: Record<string, any> = {}
  const mergeData: Record<string, any> = {}

  for (let r = 0; r < rawRows.length; r++) {
    for (let c = 0; c < rawRows[r].length; c++) {
      const raw = rawRows[r][c]
      if (raw === '' || raw === undefined || raw === null) continue

      // Try to detect numbers
      const num = Number(raw)
      const isNum = raw !== '' && !isNaN(num) && raw.trim() !== ''

      cellData[`${r}_${c}`] = {
        v: isNum ? num : raw,
        m: raw,
        t: isNum ? 2 : 1, // 2 = number, 1 = string
      }
    }
  }

  return {
    id: 'csv-workbook',
    sheetOrder: ['csv-sheet'],
    sheets: {
      'csv-sheet': {
        id: 'csv-sheet',
        name: sheetName || 'Sheet1',
        tabColor: '',
        hidden: 0,
        rowCount: Math.max(rawRows.length + 100, 200),
        columnCount: Math.max(maxCols + 10, 26),
        zoomRatio: 1,
        scrollTop: 0,
        scrollLeft: 0,
        defaultColumnWidth: 93,
        defaultRowHeight: 27,
        mergeData,
        cellData,
        rowData: {},
        columnData: {},
        showGridlines: 1,
        protections: [],
        freeze: {},
      },
    },
    name: '',
    appVersion: '0.0.1',
    locale: 'zhCN',
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function CsvPreview({ blob, fileName, fileSize }: {
  blob: Blob
  fileName: string
  fileSize: number
}) {
  const [state, setState] = useState<PreviewState>({ status: 'parsing' })
  const containerRef = useRef<HTMLDivElement>(null)
  const univerRef = useRef<any>(null)
  const [containerId] = useState(() => `csv-univer-${Math.random().toString(36).slice(2, 8)}`)

  // ── Parse & render ────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    async function load() {
      try {
        // Step 1: Parse CSV with SheetJS
        const XLSX = await import('xlsx').then(m => m.default ?? m)
        const text = await blob.text()
        const cleaned = text.replace(/^\uFEFF/, '')

        const workbook = XLSX.read(cleaned, { type: 'string' })
        const sheetName = workbook.SheetNames[0]
        if (!sheetName) {
          if (!cancelled) setState({ status: 'fallback', headers: [], rows: [] })
          return
        }

        const ws = workbook.Sheets[sheetName]
        if (!ws) {
          if (!cancelled) setState({ status: 'fallback', headers: [], rows: [] })
          return
        }

        // Get 2D array and row count
        const rawRows: string[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: '',
          blankrows: false,
        })

        let totalRows = 0
        if (ws['!ref']) {
          const range = XLSX.utils.decode_range(ws['!ref'])
          totalRows = Math.max(0, range.e.r - range.s.r)
        }

        if (cancelled) return

        // Step 2: Check threshold
        if (totalRows > MAX_ROWS_FOR_RENDER) {
          setState({ status: 'degraded', totalRows })
          return
        }

        if (rawRows.length === 0) {
          if (!cancelled) setState({ status: 'fallback', headers: [], rows: [] })
          return
        }

        // Step 3: Build Univer data directly from 2D array
        const sheetDisplayName = fileName.replace(/\.csv$/i, '')
        const univerData = buildUniverData(rawRows, sheetDisplayName)

        if (cancelled) return

        // Step 4: Create Univer instance (read-only viewer)
        const { createUniver, LocaleType, mergeLocales } = await import('@univerjs/presets')
        const { default: sheetsCoreZhCN } = await import('@univerjs/preset-sheets-core/locales/zh-CN')
        const { default: sheetsDrawingZhCN } = await import('@univerjs/preset-sheets-drawing/locales/zh-CN')
        const { UniverSheetsCorePreset } = await import('@univerjs/preset-sheets-core')
        const { UniverSheetsDrawingPreset } = await import('@univerjs/preset-sheets-drawing')

        const { univerAPI } = createUniver({
          locale: LocaleType.ZH_CN,
          locales: {
            [LocaleType.ZH_CN]: mergeLocales(sheetsCoreZhCN, sheetsDrawingZhCN),
          },
          presets: [
            UniverSheetsCorePreset({
              container: containerId,
              toolbar: false,
              contextMenu: false,
              formulaBar: false,
            }),
            UniverSheetsDrawingPreset(),
          ],
        })

        // Load the workbook data
        univerAPI.createWorkbook(univerData as any)

        // Set read-only mode after render
        univerAPI.addEvent(univerAPI.Event.LifeCycleChanged, ({ stage }: any) => {
          if (stage === univerAPI.Enum.LifecycleStages.Rendered) {
            const fWorkbook = univerAPI.getActiveWorkbook()
            if (fWorkbook) {
              fWorkbook.disableSelection()
              const permission = fWorkbook.getWorkbookPermission()
              permission.setReadOnly()
              permission.setPermissionDialogVisible(false)
            }
          }
        })

        univerRef.current = univerAPI

        if (!cancelled) {
          setState({ status: 'ready' })
        }
      } catch (err) {
        if (cancelled) return
        // Univer/SheetJS failed — fallback to simple HTML table
        try {
          const text = await blob.text()
          const cleaned = text.replace(/^\uFEFF/, '')
          const { headers, rows } = parseCsvForFallback(cleaned)
          setState({ status: 'fallback', headers, rows })
        } catch {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    load()

    return () => {
      cancelled = true
      if (univerRef.current) {
        try {
          univerRef.current.dispose()
        } catch { /* ignore */ }
        univerRef.current = null
      }
    }
  }, [blob, fileName, containerId])

  // ── Fallback HTML table ─────────────────────────────────────────────────

  const fallbackRows = state.status === 'fallback' && state.rows
    ? state.rows.slice(0, MAX_FALLBACK_ROWS)
    : []
  const fallbackTruncated = state.status === 'fallback' && state.rows
    ? state.rows.length - fallbackRows.length
    : 0

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full w-full">
      {/* Univer container — only visible when Univer is used */}
      {(state.status === 'parsing' || state.status === 'ready' || state.status === 'degraded' || state.status === 'error') && (
        <div
          id={containerId}
          ref={containerRef}
          className="h-full w-full"
        />
      )}

      {/* Overlay: loading */}
      {state.status === 'parsing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-neutral-950/80">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            <p className="text-xs text-neutral-400">Loading CSV...</p>
          </div>
        </div>
      )}

      {/* Overlay: error */}
      {state.status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white p-4 dark:bg-neutral-950">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
            <AlertCircle className="h-5 w-5 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">Failed to load CSV</p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{state.message}</p>
          </div>
        </div>
      )}

      {/* Overlay: degraded (too many rows) */}
      {state.status === 'degraded' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white p-6 dark:bg-neutral-950">
          <FileText className="h-10 w-10 text-neutral-300" />
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {fileName}
            </p>
            <p className="mt-1 text-[10px] text-neutral-400">
              {formatBytes(fileSize)} · {state.totalRows.toLocaleString()} rows
            </p>
          </div>
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              数据量过大（{state.totalRows.toLocaleString()} 行），本地渲染可能卡顿
            </p>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              💡 切换到 <strong>Text</strong> 视图查看摘要，或用 Python 分析：{' '}
              <code className="rounded bg-neutral-100 px-1 text-[10px] dark:bg-neutral-800">
                pd.read_csv('...')
              </code>
            </p>
          </div>
        </div>
      )}

      {/* Fallback: simple HTML table (when Univer fails to load) */}
      {state.status === 'fallback' && (
        <div className="flex h-full w-full flex-col">
          {/* Stats bar */}
          {state.headers.length > 0 && (
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900">
              <Table className="h-3.5 w-3.5 text-neutral-400" />
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {state.rows.length} row{state.rows.length !== 1 ? 's' : ''} × {state.headers.length} column{state.headers.length !== 1 ? 's' : ''}
              </span>
              {fallbackTruncated > 0 && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  (showing first {MAX_FALLBACK_ROWS.toLocaleString()} of {state.rows.length.toLocaleString()})
                </span>
              )}
              <span className="text-[11px] text-neutral-300 dark:text-neutral-600">
                (simplified view)
              </span>
            </div>
          )}

          <div className="flex-1 overflow-auto">
            {state.headers.length > 0 ? (
              <table className="csv-preview-table w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="w-10 min-w-[2.5rem] bg-neutral-100 px-2 py-1.5 text-center text-[10px] font-medium text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
                      #
                    </th>
                    {state.headers.map((h, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap bg-neutral-100 px-3 py-1.5 text-left text-[11px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                        title={h}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fallbackRows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={ri % 2 === 0
                        ? 'bg-white dark:bg-neutral-950'
                        : 'bg-neutral-50/50 dark:bg-neutral-900/50'}
                    >
                      <td className="px-2 py-1 text-center text-[10px] text-neutral-300 dark:text-neutral-600">
                        {ri + 1}
                      </td>
                      {state.headers.map((_, ci) => (
                        <td
                          key={ci}
                          className="max-w-[300px] truncate px-3 py-1 text-neutral-700 dark:text-neutral-300"
                          title={row[ci] ?? ''}
                        >
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex h-full items-center justify-center p-4">
                <p className="text-xs text-neutral-400">(empty CSV file)</p>
              </div>
            )}
          </div>

          {/* Inline styles for fallback table */}
          <style>{`
            .csv-preview-table th,
            .csv-preview-table td {
              border-right: 1px solid var(--border-color, #e5e5e5);
            }
            .csv-preview-table th:last-child,
            .csv-preview-table td:last-child {
              border-right: none;
            }
            .csv-preview-table tbody tr:hover {
              background-color: rgba(59, 130, 246, 0.04) !important;
            }
            .dark .csv-preview-table th,
            .dark .csv-preview-table td {
              --border-color: #404040;
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
