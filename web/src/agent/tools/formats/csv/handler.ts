/**
 * CSV Format Handler — text extraction for AI read tool.
 *
 * Parses CSV files into Markdown tables for LLM consumption.
 * Strategy:
 *   - ≤50 data rows → full Markdown table
 *   - >50 rows → header + first 50 rows + summary + python hint
 *   - Handles quoted fields, escaped quotes, various delimiters
 *
 * CSV is a text-based format, so binaryMode is false.
 * Write support is included since CSV is plain text and fully round-trippable.
 */

import type { FormatHandler, FormatReadResult } from '../../format-registry'

// ── Constants ─────────────────────────────────────────────────────────────

/** Character threshold: at or below this, output full text */
const FULL_ROWS_THRESHOLD = 50

// ── CSV Parser ────────────────────────────────────────────────────────────

interface ParseResult {
  headers: string[]
  rows: string[][]
  totalRows: number
  totalCols: number
  delimiter: string
}

/**
 * Auto-detect CSV delimiter by checking the first line for common delimiters.
 * Priority: comma > tab > semicolon > pipe
 */
function detectDelimiter(firstLine: string): string {
  const candidates = [
    { char: ',', count: 0 },
    { char: '\t', count: 0 },
    { char: ';', count: 0 },
    { char: '|', count: 0 },
  ]

  // Count occurrences outside of quoted fields
  let inQuotes = false
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < firstLine.length && firstLine[i + 1] === '"') {
        i++ // skip escaped quote
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

  // Pick delimiter with highest count (at least 1 occurrence)
  const sorted = candidates.filter(c => c.count > 0).sort((a, b) => b.count - a.count)
  return sorted.length > 0 ? sorted[0].char : ','
}

/**
 * Parse a single CSV line, respecting quoted fields.
 * Handles:
 *   - "field with ""escaped"" quotes"
 *   - "field with
 * newline" (multiline quoted fields)
 */
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
        i++ // skip CR
      } else if (ch === '\n') {
        break
      } else {
        current += ch
        i++
      }
    }
  }

  // Push last field
  fields.push(current)

  // If we ended in an open quote, signal that this is a partial line (multiline field)
  if (inQuotes) return null

  return fields
}

/**
 * Parse CSV text into headers + rows.
 * Handles multiline quoted fields by joining continuation lines.
 */
function parseCsv(text: string): ParseResult {
  const lines = text.split('\n')

  // Skip empty lines at start
  let startIdx = 0
  while (startIdx < lines.length && lines[startIdx].trim() === '') startIdx++

  if (startIdx >= lines.length) {
    return { headers: [], rows: [], totalRows: 0, totalCols: 0, delimiter: ',' }
  }

  // Detect delimiter from first non-empty line
  const delimiter = detectDelimiter(lines[startIdx])

  // Parse all rows, joining multiline quoted fields
  const allRows: string[][] = []
  let buffer = ''
  let bufferRow: string[] | null = null

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]
    if (buffer) {
      buffer += '\n' + line
    } else {
      buffer = line
    }

    const parsed = parseCsvLine(buffer, delimiter)

    if (parsed === null) {
      // Incomplete line (multiline quoted field) — continue accumulating
      if (bufferRow) {
        // Already have partial fields from previous attempt, keep accumulating
      }
      continue
    }

    // Skip completely empty rows (all fields empty after trim)
    const trimmedFields = parsed.map(f => f.trim())
    if (trimmedFields.every(f => f === '') && allRows.length > 0) continue

    allRows.push(parsed)
    buffer = ''
    bufferRow = null
  }

  // Handle remaining buffer (file ends mid-quote)
  if (buffer.trim()) {
    // Force-close the quote and add whatever we have
    allRows.push(buffer.split(delimiter).map(f => f.replace(/^"|"$/g, '')))
  }

  if (allRows.length === 0) {
    return { headers: [], rows: [], totalRows: 0, totalCols: 0, delimiter }
  }

  // First row is headers
  const headers = allRows[0].map((v, i) =>
    v.trim() !== '' ? v.trim() : `Col ${i + 1}`
  )
  const dataRows = allRows.slice(1)
  const totalCols = Math.max(headers.length, ...dataRows.map(r => r.length))

  return {
    headers,
    rows: dataRows,
    totalRows: dataRows.length,
    totalCols,
    delimiter,
  }
}

// ── Markdown Table Renderer ───────────────────────────────────────────────

/** Sanitize a cell value for Markdown table display */
function sanitizeCell(v: string): string {
  if (!v) return ''
  return v.replace(/\|/g, '│').replace(/\n/g, ' ').replace(/\r/g, '')
}

/** Convert headers + rows to Markdown table */
function toMarkdownTable(headers: string[], rows: string[][]): string {
  const headerLine = '| ' + headers.map(sanitizeCell).join(' | ') + ' |'
  const separatorLine = '| ' + headers.map(() => '---').join(' | ') + ' |'
  const dataLines = rows.map(
    row => '| ' + headers.map((_, i) => sanitizeCell(row[i] ?? '')).join(' | ') + ' |',
  )
  return [headerLine, separatorLine, ...dataLines].join('\n')
}

// ── Handler ───────────────────────────────────────────────────────────────

export const csvHandler: FormatHandler = {
  extension: 'csv',
  label: 'CSV Spreadsheet',
  binaryMode: true,
  formatHint:
    'This is a CSV (Comma-Separated Values) file. read() returns data as a Markdown table. '
    + 'For small files (≤50 data rows), full content is shown. '
    + 'For larger files, header + first 50 rows + summary are shown. '
    + 'Write/edit is supported — provide valid CSV text content.',

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    const text = new TextDecoder('utf-8').decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data)

    // Handle BOM
    const cleaned = text.replace(/^\uFEFF/, '')

    if (cleaned.trim() === '') {
      return {
        content: `[CSV] ${path}\n(empty file)`,
        kind: 'csv',
      }
    }

    const { headers, rows, totalRows, totalCols, delimiter } = parseCsv(cleaned)

    if (headers.length === 0) {
      return {
        content: `[CSV] ${path}\nNo parseable content found.`,
        kind: 'csv',
      }
    }

    // Build output
    const parts: string[] = []
    const isSmall = totalRows <= FULL_ROWS_THRESHOLD

    parts.push(`[CSV] ${path}`)
    parts.push(`Rows: ${totalRows}`)
    parts.push(`Columns: ${totalCols}`)
    parts.push(`Delimiter: "${delimiter === '\t' ? 'tab' : delimiter}"`)
    parts.push('')

    if (totalRows === 0) {
      parts.push('(empty — headers only)')
      parts.push(toMarkdownTable(headers, []))
    } else if (isSmall) {
      parts.push(toMarkdownTable(headers, rows))
    } else {
      const previewRows = rows.slice(0, FULL_ROWS_THRESHOLD)
      parts.push(toMarkdownTable(headers, previewRows))
      parts.push('')
      const remaining = totalRows - FULL_ROWS_THRESHOLD
      parts.push(`... ${remaining} more row${remaining !== 1 ? 's' : ''} (showing first ${FULL_ROWS_THRESHOLD} of ${totalRows})`)
    }

    // Add pandas analysis hint for all csv reads
    const csvFileName = path.split('/').pop()!
    parts.push('')
    parts.push(`💡 Use Python (pandas) for deeper analysis: pd.read_csv('${csvFileName}')`)
    parts.push('   Example: df = pd.read_csv(...); df.describe(); df.groupby(...).agg(...); df.plot(...)')

    return {
      content: parts.join('\n'),
      kind: 'csv',
      metadata: {
        totalRows,
        totalCols,
        delimiter: delimiter === '\t' ? 'tab' : delimiter,
        headers,
      },
    }
  },

  async write(content: string, _path: string): Promise<ArrayBuffer> {
    // Content is already CSV text — just encode it
    const encoder = new TextEncoder()
    return encoder.encode(content).buffer as ArrayBuffer
  },
}
