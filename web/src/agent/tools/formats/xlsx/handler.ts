/**
 * XLSX Format Handler — lightweight text extraction for AI read tool.
 *
 * Uses SheetJS (xlsx) to parse Excel files and render as Markdown tables.
 * Strategy:
 *   - ≤10 data rows → full Markdown table (all data)
 *   - >10 rows → header + first 10 rows + summary + python hint
 *   - Multi-sheet → process each sheet, show all for small files, summary for large
 *
 * Visual preview uses Univer (≤30,000 rows) or degraded mode (>30,000 rows).
 * This handler is for AI text extraction only.
 */

import type { FormatHandler, FormatReadResult } from '../../format-registry'

// ── Types ─────────────────────────────────────────────────────────────────

/** Threshold: rows at or below this count get full output */
const FULL_ROWS_THRESHOLD = 10

interface SheetInfo {
  name: string
  totalRows: number
  totalCols: number
  headers: string[]
  rows: unknown[][]
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Convert a 2D array of cells into a Markdown table string */
function toMarkdownTable(headers: string[], rows: unknown[][]): string {
  // Sanitize headers — replace pipes and newlines
  const sanitize = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    return String(v).replace(/\|/g, '│').replace(/\n/g, ' ')
  }

  const headerLine = '| ' + headers.map(sanitize).join(' | ') + ' |'
  const separatorLine = '| ' + headers.map(() => '---').join(' | ') + ' |'
  const dataLines = rows.map(
    row => '| ' + row.map(sanitize).join(' | ') + ' |',
  )

  return [headerLine, separatorLine, ...dataLines].join('\n')
}

/** Extract all sheet data from a workbook */
function extractSheets(XLSX: typeof import('xlsx').default, data: ArrayBuffer | Uint8Array): SheetInfo[] {
  const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  const workbook = XLSX.read(input, { type: 'array' })

  const sheets: SheetInfo[] = []

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) continue

    // Convert to 2D array — header:1 gives array-of-arrays
    const raw: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false,
    })

    if (raw.length === 0) {
      sheets.push({ name: sheetName, totalRows: 0, totalCols: 0, headers: [], rows: [] })
      continue
    }

    // First row as headers
    const headerRow = raw[0] as unknown[]
    const headers = headerRow.map((v, i) =>
      v !== null && v !== undefined && String(v).trim() !== ''
        ? String(v).trim()
        : `Col ${i + 1}`,
    )
    const dataRows = raw.slice(1)

    // Determine column count (max width across all rows including header)
    const totalCols = Math.max(headers.length, ...dataRows.map(r => (r as unknown[])?.length ?? 0))

    sheets.push({
      name: sheetName,
      totalRows: dataRows.length,
      totalCols,
      headers,
      rows: dataRows as unknown[][],
    })
  }

  return sheets
}

// ── Handler ───────────────────────────────────────────────────────────────

export const xlsxHandler: FormatHandler = {
  extension: 'xlsx',
  label: 'Excel Spreadsheet',
  binaryMode: true,
  formatHint:
    'This is an Excel (.xlsx) spreadsheet. read() returns sheet data as Markdown tables. '
    + 'For small sheets (≤10 data rows), full content is shown. '
    + 'For larger sheets, header + first 10 rows + summary are shown. '
    + 'This is a read-only format. Use Python (pandas) for complex analysis.',

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    // Dynamic import — xlsx library is ~800KB, only load when needed
    let XLSX: typeof import('xlsx').default
    try {
      const mod = await import('xlsx')
      XLSX = mod.default ?? mod
    } catch {
      return {
        content: `[Excel] ${path}\nFailed to load xlsx library. Ensure the 'xlsx' package is installed.`,
        kind: 'xlsx',
      }
    }

    // Parse workbook
    let sheets: SheetInfo[]
    try {
      sheets = extractSheets(XLSX, data)
    } catch (e) {
      return {
        content: `[Excel] ${path}\nFailed to parse file: ${e instanceof Error ? e.message : String(e)}. The file may be corrupted or not a valid .xlsx.`,
        kind: 'xlsx',
      }
    }

    if (sheets.length === 0) {
      return {
        content: `[Excel] ${path}\nNo sheets found. The file may be empty or corrupted.`,
        kind: 'xlsx',
      }
    }

    // Build output
    const parts: string[] = []
    const totalDataRows = sheets.reduce((sum, s) => sum + s.totalRows, 0)
    const isSmall = totalDataRows <= FULL_ROWS_THRESHOLD

    parts.push(`[Excel] ${path}`)
    parts.push(`Sheets: ${sheets.length}`)
    parts.push(`Total data rows: ${totalDataRows}`)
    parts.push('')

    for (const sheet of sheets) {
      // Sheet header
      parts.push(`--- Sheet: "${sheet.name}" (${sheet.totalRows} rows × ${sheet.totalCols} cols) ---`)
      parts.push('')

      if (sheet.totalRows === 0) {
        parts.push('(empty sheet — headers only)')
        if (sheet.headers.length > 0) {
          parts.push(toMarkdownTable(sheet.headers, []))
        }
        parts.push('')
        continue
      }

      if (isSmall || sheet.totalRows <= FULL_ROWS_THRESHOLD) {
        // Full content
        parts.push(toMarkdownTable(sheet.headers, sheet.rows))
      } else {
        // Truncated: header + first N rows + summary
        const previewRows = sheet.rows.slice(0, FULL_ROWS_THRESHOLD)
        parts.push(toMarkdownTable(sheet.headers, previewRows))
        parts.push('')
        const remaining = sheet.totalRows - FULL_ROWS_THRESHOLD
        parts.push(`... ${remaining} more row${remaining !== 1 ? 's' : ''} (showing first ${FULL_ROWS_THRESHOLD} of ${sheet.totalRows})`)
      }

      parts.push('')
    }

    // Add pandas analysis hint for all xlsx reads
    const fileName = path.split('/').pop()!
    if (sheets.length > 1) {
      const sheetNames = sheets.map(s => `"${s.name}"`).join(', ')
      parts.push(`📋 Sheets: [${sheetNames}]  — use sheet_name parameter to access specific sheet`)
    }
    const sheetHint = sheets.length === 1
      ? `pd.read_excel('${fileName}')`
      : `pd.read_excel('${fileName}', sheet_name='${sheets[0].name}')`
    parts.push(`💡 Use Python (pandas) for deeper analysis: ${sheetHint}`)
    parts.push('   Example: df = pd.read_excel(...); df.describe(); df.groupby(...).agg(...); df.plot(...)')

    return {
      content: parts.join('\n'),
      kind: 'xlsx',
      metadata: {
        sheetCount: sheets.length,
        totalDataRows,
        sheets: sheets.map(s => ({
          name: s.name,
          rows: s.totalRows,
          cols: s.totalCols,
        })),
      },
    }
  },
}
