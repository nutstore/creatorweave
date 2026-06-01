/**
 * NGM format UI handler — text view only (no diagram preview).
 *
 * Diagram rendering via draw.io viewer or maxGraph was explored but
 * results were unsatisfactory. Currently only text extraction is
 * supported — the AI can read diagram content via the read tool.
 */

import { registerFormatUI, getFormatHandler } from '../../format-registry'

registerFormatUI({
  extension: 'ngm',

  viewModes: [
    { id: 'text', label: 'Text', default: true },
  ],

  renderTextContent: async (data, path) => {
    const handler = getFormatHandler(path)
    if (!handler) throw new Error('No format handler for .ngm')
    const result = await handler.read(data, path)
    return result.content
  },
})
