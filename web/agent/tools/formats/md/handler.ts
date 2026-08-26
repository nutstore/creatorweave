/**
 * Markdown Format Handler — read/write support for .md/.markdown files.
 *
 * Markdown is a text-based format, so binaryMode is false.
 * read() returns the raw markdown source as text for LLM consumption.
 * Write support is trivial — content is already markdown text.
 *
 * Unlike most handlers, this one exists primarily to register a UI handler
 * (see ui.ts) that adds a rendered-preview view mode to FilePreview.
 * The read/write behaviour is identical to plain text.
 */

import type { FormatHandler, FormatReadResult } from '../../format-registry'

// ── Constants ─────────────────────────────────────────────────────────────

/** Max characters to show in read() output (markdown files can be huge) */
const MAX_READ_LENGTH = 100000

// ── Handler ───────────────────────────────────────────────────────────────

export const mdHandler: FormatHandler = {
  extension: 'md',
  label: 'Markdown Document',
  binaryMode: false,
  formatHint:
    'This is a Markdown file. read() returns the raw markdown source. '
    + 'Write/edit is supported — provide valid markdown content.',

  // IMPORTANT: read() output must be byte-for-byte identical to the original
  // file content so that the read → edit → write round-trip is lossless.
  // Do NOT prepend a header or post-process the text — return it raw.
  async read(data: ArrayBuffer | Uint8Array): Promise<FormatReadResult> {
    const text = new TextDecoder('utf-8').decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data)

    if (text.length > MAX_READ_LENGTH) {
      // Truncation breaks write symmetry, so only metadata is annotated;
      // the returned content is still a faithful prefix of the file.
      return {
        content: text.slice(0, MAX_READ_LENGTH),
        kind: 'md',
        metadata: {
          totalLength: text.length,
          truncated: true,
          note: `Showing first ${MAX_READ_LENGTH.toLocaleString()} of ${text.length.toLocaleString()} chars.`,
        },
      }
    }

    return {
      content: text,
      kind: 'md',
    }
  },

  async write(content: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder()
    return encoder.encode(content).buffer as ArrayBuffer
  },
}
