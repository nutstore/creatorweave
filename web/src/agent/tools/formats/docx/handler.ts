/**
 * DOCX Format Handler — lightweight text extraction for AI read tool.
 *
 * Extracts text from .docx files using fflate (ZIP) + DOMParser (XML).
 * For editing, the agent should use the cw:word-editor skill (Python/Pyodide)
 * which provides a full structured DocumentModel + 89 EditOps.
 */

import type { FormatHandler, FormatReadResult } from '../../format-registry'
import { unzipSync } from 'fflate'

/** Extract all text content from a docx XML element, recursively */
function extractTextFromXml(doc: Document, nsResolver: (prefix: string) => string | null): string {
  const paragraphs: string[] = []
  const pNodes = doc.evaluate('//w:p', doc, nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)

  for (let i = 0; i < pNodes.snapshotLength; i++) {
    const pNode = pNodes.snapshotItem(i)
    if (!pNode) continue

    const runs: string[] = []
    const rNodes = doc.evaluate('.//w:r/w:t', pNode, nsResolver, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
    for (let j = 0; j < rNodes.snapshotLength; j++) {
      const tNode = rNodes.snapshotItem(j)
      if (tNode?.textContent) runs.push(tNode.textContent)
    }

    const text = runs.join('')
    if (text) paragraphs.push(text)
  }

  return paragraphs.join('\n')
}

export const docxHandler: FormatHandler = {
  extension: 'docx',
  label: 'Word Document',
  binaryMode: true,
  formatHint:
    'This is a Word (.docx) document. read() returns basic text extraction. '
    + 'To edit, restructure, or perform detailed analysis, use the cw:word-editor skill '
    + 'which provides full document structure (paragraphs, tables, images, styles) and 89 edit operations.',

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    const input = data instanceof ArrayBuffer ? new Uint8Array(data) : data
    const unzipped = unzipSync(input)

    // Find document.xml (may be under word/ prefix)
    let docXml: Uint8Array | undefined
    for (const [name, content] of Object.entries(unzipped)) {
      if (name === 'word/document.xml') {
        docXml = content
        break
      }
    }

    if (!docXml) {
      return {
        content: `[Word Document] ${path}\nCould not find document.xml in archive. The file may be corrupted.`,
        kind: 'docx',
      }
    }

    // Parse XML
    const xmlStr = new TextDecoder('utf-8').decode(docXml)
    const parser = new DOMParser()
    const doc = parser.parseFromString(xmlStr, 'application/xml')

    // Check for parse errors
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      return {
        content: `[Word Document] ${path}\nXML parse error: ${parseError.textContent}`,
        kind: 'docx',
      }
    }

    // Namespace resolver for Word ML
    const nsResolver = (prefix: string): string | null => {
      const ns: Record<string, string> = {
        'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
        'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      }
      return ns[prefix] ?? null
    }

    const text = extractTextFromXml(doc, nsResolver)

    // Count basic stats
    const lines = text.split('\n')
    const totalParagraphs = lines.length
    const totalChars = text.length

    const content = [
      `[Word Document] ${path}`,
      `Paragraphs: ${totalParagraphs}`,
      `Characters: ${totalChars}`,
      '',
      '--- Content ---',
      '',
      text,
    ].join('\n')

    return {
      content,
      kind: 'docx',
      metadata: {
        totalParagraphs,
        totalChars,
      },
    }
  },
}
