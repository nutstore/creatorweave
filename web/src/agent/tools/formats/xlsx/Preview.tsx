/**
 * XlsxPreview - Local Excel rendering using Univer + SheetJS.
 *
 * Strategy:
 *   - Parse with SheetJS to check row count
 *   - ≤30,000 rows → full Univer Canvas rendering (styles, images, merged cells)
 *   - >30,000 rows → degraded message with python hint
 *
 * Uses @mertdeveci55/univer-import-export to convert xlsx → Univer IWorkbookData,
 * then renders with Univer open-source sheets preset.
 */

import { useState, useEffect, useRef } from 'react'
import { FileText, AlertCircle, Loader2 } from 'lucide-react'
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
  | { status: 'degraded'; totalRows: number; totalSheets: number }
  | { status: 'ready' }
  | { status: 'error'; message: string }

// ── Component ─────────────────────────────────────────────────────────────

export function XlsxPreview({ blob, fileName, fileSize }: {
  blob: Blob
  fileName: string
  fileSize: number
}) {
  const [state, setState] = useState<PreviewState>({ status: 'parsing' })
  const containerRef = useRef<HTMLDivElement>(null)
  const univerRef = useRef<any>(null)
  // Stable unique ID for the Univer container
  const [containerId] = useState(() => `xlsx-univer-${Math.random().toString(36).slice(2, 8)}`)

  // ── Parse & render ────────────────────────────────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    async function load() {
      try {
        // Step 1: Quick row count check with SheetJS
        const XLSX = await import('xlsx').then(m => m.default ?? m)
        const buffer = new Uint8Array(await blob.arrayBuffer())
        const workbook = XLSX.read(buffer, { type: 'array' })

        // Count total data rows across all sheets
        let totalRows = 0
        for (const sheetName of workbook.SheetNames) {
          const ws = workbook.Sheets[sheetName]
          if (!ws?.['!ref']) continue
          const range = XLSX.utils.decode_range(ws['!ref'])
          totalRows += Math.max(0, range.e.r - range.s.r)
        }

        if (cancelled) return

        // Step 2: Check threshold
        if (totalRows > MAX_ROWS_FOR_RENDER) {
          setState({ status: 'degraded', totalRows, totalSheets: workbook.SheetNames.length })
          return
        }

        // Step 3: Convert xlsx → Univer data via univer-import-export
        const { default: LuckyExcel } = await import('@mertdeveci55/univer-import-export')
        const univerData = await new Promise((resolve, reject) => {
          LuckyExcel.transformExcelToUniver(
            new File([blob], fileName, { type: blob.type }),
            (data: any) => resolve(data),
            (err: Error) => reject(err),
          )
        })

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

        // Set read-only mode after render (allows copy but not editing)
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
        if (!cancelled) {
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
      // Cleanup Univer instance
      if (univerRef.current) {
        try {
          univerRef.current.dispose()
        } catch { /* ignore */ }
        univerRef.current = null
      }
    }
  }, [blob, fileName, containerId])

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full w-full">
      {/* Univer container — always rendered so ref is available for useEffect */}
      <div
        id={containerId}
        ref={containerRef}
        className="h-full w-full"
      />

      {/* Overlay states */}
      {state.status === 'parsing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-neutral-950/80">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-neutral-400" />
            <p className="text-xs text-neutral-400">Loading spreadsheet...</p>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white p-4 dark:bg-neutral-950">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30">
            <AlertCircle className="h-5 w-5 text-red-400" />
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-red-600 dark:text-red-400">Failed to load spreadsheet</p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{state.message}</p>
          </div>
        </div>
      )}

      {state.status === 'degraded' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white p-6 dark:bg-neutral-950">
          <FileText className="h-10 w-10 text-neutral-300" />
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {fileName}
            </p>
            <p className="mt-1 text-[10px] text-neutral-400">
              {formatBytes(fileSize)} · {state.totalSheets} sheet{state.totalSheets !== 1 ? 's' : ''} · {state.totalRows.toLocaleString()} rows
            </p>
          </div>
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              数据量过大（{state.totalRows.toLocaleString()} 行），本地渲染可能卡顿
            </p>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              💡 切换到 <strong>Text</strong> 视图查看摘要，或用 Python 分析：{' '}
              <code className="rounded bg-neutral-100 px-1 text-[10px] dark:bg-neutral-800">
                pd.read_excel('...')
              </code>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
