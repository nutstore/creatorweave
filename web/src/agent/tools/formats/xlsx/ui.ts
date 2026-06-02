/**
 * XLSX format UI handler — preview (table) + text (Markdown) view modes.
 *
 * Follows the same pattern as PDF: two togglable view modes.
 * - preview: eo2suite rendering via OfficePreview (XlsxPreview wrapper)
 * - text: raw Markdown table via handler.read() output
 */

import { lazy } from 'react'
import { registerFormatUI, getFormatHandler } from '../../format-registry'

registerFormatUI({
  extension: 'xlsx',

  viewModes: [
    { id: 'preview', label: 'Table', default: true },
    { id: 'text', label: 'Text' },
  ],

  PreviewComponent: lazy(() =>
    import('./Preview').then(m => ({ default: m.XlsxPreview }))
  ),

  renderTextContent: async (data, path) => {
    const handler = getFormatHandler(path)
    if (!handler) throw new Error('No format handler for .xlsx')
    const result = await handler.read(data, path)
    return result.content
  },
})
