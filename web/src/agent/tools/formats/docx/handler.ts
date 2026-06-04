/**
 * DOCX Format Handler — lightweight text extraction for AI read tool.
 *
 * Extracts text from .docx files using fflate (ZIP) + DOMParser (XML).
 * Strategy:
 *   - ≤30,000 chars → full text output
 *   - >30,000 chars → first 30,000 chars + summary + python hint
 *
 * For editing, the agent should use the cw:word-editor skill (Python/Pyodide)
 * which provides a full structured DocumentModel + 89 EditOps.
 */

import type { FormatHandler, FormatReadResult } from '../../format-registry'
import { unzipSync } from 'fflate'

// ── Constants ─────────────────────────────────────────────────────────────

/** Character threshold: at or below this, output full text */
const FULL_TEXT_THRESHOLD = 10000

// ── Helpers ───────────────────────────────────────────────────────────────

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

// ── Handler ───────────────────────────────────────────────────────────────

export const docxHandler: FormatHandler = {
  extension: 'docx',
  label: 'Word Document',
  binaryMode: true,
  formatHint:
    'This is a Word (.docx) document. read() returns basic text extraction. '
    + 'For small documents (≤10K chars), full content is shown. '
    + 'For larger documents, the first 10K chars are shown with a summary. '
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

    // Build output
    const header = [
      `[Word Document] ${path}`,
      `Paragraphs: ${totalParagraphs}`,
      `Characters: ${totalChars.toLocaleString()}`,
    ]

    const fileName = path.split('/').pop()

    if (totalChars <= FULL_TEXT_THRESHOLD) {
      // Small document: full content
      return {
        content: [
          ...header,
          '',
          '--- Full Content ---',
          '',
          text,
          '',
          `💡 Use the cw:word-editor skill to edit this document (styles, formatting, tables, images, 89 edit operations).`,
        ].join('\n'),
        kind: 'docx',
        metadata: { totalParagraphs, totalChars },
      }
    }

    // Large document: first N chars + summary
    const truncated = text.slice(0, FULL_TEXT_THRESHOLD)
    // Find last newline within threshold to avoid cutting mid-paragraph
    const lastNewline = truncated.lastIndexOf('\n')
    const previewText = lastNewline > FULL_TEXT_THRESHOLD * 0.8
      ? text.slice(0, lastNewline)
      : truncated
    const remainingChars = totalChars - previewText.length

    return {
      content: [
        ...header,
        '',
        `--- First ${(previewText.length).toLocaleString()} of ${totalChars.toLocaleString()} characters ---`,
        '',
        previewText,
        '',
        `... ${remainingChars.toLocaleString()} more characters (showing first ~${FULL_TEXT_THRESHOLD.toLocaleString()} of ${totalChars.toLocaleString()})`,
        '',
        `💡 Use the cw:word-editor skill to read/edit the full document, or ask to read a specific section.`,
      ].join('\n'),
      kind: 'docx',
      metadata: { totalParagraphs, totalChars },
    }
  },
}
