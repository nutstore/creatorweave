/**
 * NGM Format Handler — read-only NGM (draw.io / mxGraph) text extraction.
 *
 * NGM files are ZIP archives containing a `data.ngm` file with mxGraph XML.
 * The XML follows the mxfile/diagram/mxGraphModel structure used by draw.io.
 *
 * For preview rendering, see Preview.tsx (maxGraph SVG rendering).
 * For editing, users should use draw.io or diagrams.net.
 */

import type { FormatHandler, FormatReadResult } from '../../format-registry'
import { unzipSync } from 'fflate'

/** Strip HTML tags and decode entities for plain-text extraction */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** Extract text content from mxGraph XML using DOMParser */
function extractTextFromMxXml(xmlStr: string): {
  text: string
  pageCount: number
  cellCount: number
  edgeCount: number
} {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlStr, 'application/xml')

  // Check for parse errors
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    return { text: '(XML parse error)', pageCount: 0, cellCount: 0, edgeCount: 0 }
  }

  const pages: string[] = []
  let totalCells = 0
  let totalEdges = 0

  // Process each <diagram> (page)
  const diagrams = doc.querySelectorAll('diagram')
  diagrams.forEach((diagram, pageIdx) => {
    const pageName = diagram.getAttribute('name') || `Page ${pageIdx + 1}`
    const entries: string[] = []

    // Process mxCell elements
    const cells = diagram.querySelectorAll('mxCell')
    cells.forEach((cell) => {
      const value = cell.getAttribute('value')
      const vertex = cell.getAttribute('vertex')
      const edge = cell.getAttribute('edge')
      const style = cell.getAttribute('style') || ''

      if (vertex === '1') {
        totalCells++
        if (value) {
          // Detect shape type from style
          let shapeLabel = 'Shape'
          if (style.includes('ellipse')) shapeLabel = 'Ellipse'
          else if (style.includes('rhombus') || style.includes('diamond')) shapeLabel = 'Diamond'
          else if (style.includes('parallelogram')) shapeLabel = 'Parallelogram'
          else if (style.includes('rounded=1') || style.includes('rounded=1')) shapeLabel = 'Rounded Rect'
          else if (style.includes('text;')) shapeLabel = 'Text'
          else if (style.includes('swimlane')) shapeLabel = 'Swimlane'
          else if (style.includes('shape=')) {
            const match = style.match(/shape=([^;]+)/)
            if (match) shapeLabel = match[1].charAt(0).toUpperCase() + match[1].slice(1)
          }

          const text = stripHtml(value)
          if (text) entries.push(`  [${shapeLabel}] ${text}`)
        }
      } else if (edge === '1') {
        totalEdges++
        if (value) {
          const text = stripHtml(value)
          if (text) entries.push(`  → ${text}`)
        }
      }
    })

    if (entries.length > 0) {
      const header = diagrams.length > 1 ? `📄 ${pageName}` : ''
      pages.push(header + (header ? '\n' : '') + entries.join('\n'))
    }
  })

  return {
    text: pages.join('\n\n'),
    pageCount: diagrams.length || 1,
    cellCount: totalCells,
    edgeCount: totalEdges,
  }
}

export const ngmHandler: FormatHandler = {
  extension: 'ngm',
  label: 'NGM Diagram (draw.io)',
  binaryMode: true,
  formatHint:
    'This is an NGM diagram file (draw.io/mxGraph format stored in a ZIP). read() returns extracted text content. '
    + 'This is a read-only format — to edit, use draw.io or diagrams.net.',

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data

    // Step 1: Unzip to find data.ngm
    let unzipped: Record<string, Uint8Array>
    try {
      unzipped = unzipSync(input)
    } catch {
      return {
        content: `[NGM Diagram] ${path}\nFailed to unzip. The file may be corrupted.`,
        kind: 'ngm',
      }
    }

    // Find the data file (data.ngm)
    let ngmXml: Uint8Array | undefined
    for (const [name, content] of Object.entries(unzipped)) {
      if (name === 'data.ngm' || name.endsWith('/data.ngm')) {
        ngmXml = content
        break
      }
    }

    if (!ngmXml) {
      // Fallback: try any XML-like file in the archive
      for (const [name, content] of Object.entries(unzipped)) {
        if (name.endsWith('.xml') || name.endsWith('.ngm')) {
          ngmXml = content
          break
        }
      }
    }

    if (!ngmXml) {
      const fileList = Object.keys(unzipped).join(', ')
      return {
        content: `[NGM Diagram] ${path}\nNo diagram data found in archive. Files: ${fileList}`,
        kind: 'ngm',
      }
    }

    // Step 2: Parse XML and extract text
    const xmlStr = new TextDecoder('utf-8').decode(ngmXml)
    const { text, pageCount, cellCount, edgeCount } = extractTextFromMxXml(xmlStr)

    // Step 3: Build result
    const content = [
      `[NGM Diagram] ${path}`,
      `Pages: ${pageCount}`,
      `Shapes: ${cellCount}`,
      `Edges: ${edgeCount}`,
      '',
      '--- Content ---',
      '',
      text || '(No text content in diagram)',
      '',
      '💡 This is a draw.io diagram (.ngm). This is a read-only format — to edit, use draw.io or diagrams.net.',
    ].join('\n')

    return {
      content,
      kind: 'ngm',
      metadata: {
        pageCount,
        cellCount,
        edgeCount,
      },
    }
  },
}
