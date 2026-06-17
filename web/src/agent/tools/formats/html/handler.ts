/**
 * HTML Format Handler — read/write support for .html/.htm files.
 *
 * HTML is a text-based format, so binaryMode is false.
 * read() returns the raw HTML source as text for LLM consumption.
 * Write support is trivial — content is already HTML text.
 */

import type { FormatHandler, FormatReadResult } from '../../format-registry'

// ── Constants ─────────────────────────────────────────────────────────────

/** Max characters to show in read() output (HTML can be huge) */
const MAX_READ_LENGTH = 50000

// ── Handler ───────────────────────────────────────────────────────────────

export const htmlHandler: FormatHandler = {
  extension: 'html',
  label: 'HTML Document',
  binaryMode: false,
  formatHint:
    'This is an HTML file. read() returns the raw HTML source code. '
    + 'Write/edit is supported — provide valid HTML content. '
    + 'For self-contained HTML (inline CSS/JS), the file can be previewed directly in the browser.',

  async read(data: ArrayBuffer | Uint8Array, path: string): Promise<FormatReadResult> {
    const text = new TextDecoder('utf-8').decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data)
    const fileName = path.split('/').pop() || path

    if (text.trim() === '') {
      return {
        content: `[HTML] ${fileName}\n(empty file)`,
        kind: 'html',
      }
    }

    // For large files, truncate with a summary
    if (text.length > MAX_READ_LENGTH) {
      const truncated = text.slice(0, MAX_READ_LENGTH)
      return {
        content: `[HTML] ${fileName}\n(${text.length.toLocaleString()} chars, showing first ${MAX_READ_LENGTH.toLocaleString()})\n\n${truncated}\n\n... (${(text.length - MAX_READ_LENGTH).toLocaleString()} more chars truncated)`,
        kind: 'html',
        metadata: {
          totalLength: text.length,
          truncated: true,
        },
      }
    }

    return {
      content: `[HTML] ${fileName}\n\n${text}`,
      kind: 'html',
    }
  },

  async write(content: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder()
    return encoder.encode(content).buffer as ArrayBuffer
  },
}
