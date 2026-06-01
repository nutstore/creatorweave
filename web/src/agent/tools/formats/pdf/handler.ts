/**
 * PDF Format Handler — read-only PDF text extraction.
 *
 * Strategy: For large PDFs, only return metadata + first few pages.
 * AI can then use python/pypdf to read specific pages on demand.
 * This avoids flooding the context window with hundreds of pages.
 *
 * For preview rendering, see Preview.tsx (canvas rendering).
 */

import type { FormatHandler, FormatReadResult } from '../../format-registry'
import type { PDFPageProxy } from 'pdfjs-dist'
import { getPdfjs } from './pdfjs'

const MAX_FULL_PAGES = 3 // Pages to fully extract before switching to outline mode

/** Extract text from a single page, reconstructing line breaks from Y-position */
async function extractPageText(page: PDFPageProxy): Promise<string> {
  const textContent = await page.getTextContent()
  const lines: string[] = []
  let lastY: number | null = null
  let currentLine = ''

  for (const item of textContent.items) {
    if (!('str' in item)) continue
    const y = Math.round(item.transform[5])
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      if (currentLine.trim()) lines.push(currentLine.trim())
      currentLine = item.str
    } else {
      currentLine += item.str
    }
    lastY = y
  }
  if (currentLine.trim()) lines.push(currentLine.trim())

  return lines.join('\n')
}

/** Extract first N characters from a page as a preview snippet */
async function extractPageSnippet(page: PDFPageProxy, maxChars: number): Promise<string> {
  const text = await extractPageText(page)
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '…'
}

export const pdfHandler: FormatHandler = {
  extension: 'pdf',
  label: 'PDF Document',
  binaryMode: true,
  formatHint:
    'This is a PDF file. For large PDFs, read() returns only the first few pages. '
    + 'To read specific pages, use the python tool with pypdf: '
    + 'import pypdf; reader = pypdf.PdfReader("path/to/file.pdf"); '
    + 'page = reader.pages[N]; print(page.extract_text())',

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    const buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)

    const pdfjsLib = await getPdfjs()
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise
    const totalPages = doc.numPages

    // Extract metadata
    const metadata = await doc.getMetadata().catch(() => null)
    const info = metadata?.info as Record<string, string> | undefined

    const header: string[] = [
      `[PDF Document] ${path}`,
      `Pages: ${totalPages}`,
    ]

    if (info) {
      if (info['Title']) header.push(`Title: ${info['Title']}`)
      if (info['Author']) header.push(`Author: ${info['Author']}`)
      if (info['Creator']) header.push(`Creator: ${info['Creator']}`)
      if (info['Producer']) header.push(`Producer: ${info['Producer']}`)
    }

    // Strategy: small PDFs → full text, large PDFs → first pages + outline
    if (totalPages <= MAX_FULL_PAGES) {
      // Small PDF: extract all pages
      const pages: string[] = []
      for (let i = 1; i <= totalPages; i++) {
        const page = await doc.getPage(i)
        const pageText = await extractPageText(page)
        if (pageText.trim()) {
          pages.push(`<!-- page ${i} -->\n${pageText}`)
        }
      }

      const content = [
        ...header,
        '',
        '--- Full Content ---',
        '',
        pages.join('\n\n'),
      ].join('\n')

      return { content, kind: 'pdf', metadata: { totalPages } }
    }

    // Large PDF: first few pages in full + page outline for the rest
    const fullPages: string[] = []
    const outlineEntries: string[] = []

    // Extract first 3 pages in full
    const fullPageCount = Math.min(3, totalPages)
    for (let i = 1; i <= fullPageCount; i++) {
      const page = await doc.getPage(i)
      const pageText = await extractPageText(page)
      if (pageText.trim()) {
        fullPages.push(`<!-- page ${i} -->\n${pageText}`)
      }
    }

    // Build outline: snippet for remaining pages (first 120 chars each)
    for (let i = fullPageCount + 1; i <= totalPages; i++) {
      const page = await doc.getPage(i)
      const snippet = await extractPageSnippet(page, 120)
      if (snippet.trim()) {
        outlineEntries.push(`  Page ${i}: ${snippet.split('\n')[0]}`)
      } else {
        outlineEntries.push(`  Page ${i}: (empty or image-only page)`)
      }
    }

    const content = [
      ...header,
      '',
      `--- First ${fullPageCount} pages (full text) ---`,
      '',
      fullPages.join('\n\n'),
      '',
      `--- Pages ${fullPageCount + 1}–${totalPages} (outline) ---`,
      '',
      ...outlineEntries,
      '',
      `To read a specific page in full, use python:`,
      `  import pypdf`,
      `  reader = pypdf.PdfReader("/mnt/<rootName>/${path}")`,
      `  print(reader.pages[N].extract_text())  # N is 0-based page index`,
    ].join('\n')

    return {
      content,
      kind: 'pdf',
      metadata: {
        totalPages,
        title: info?.['Title'] ?? null,
        author: info?.['Author'] ?? null,
      },
    }
  },
}
