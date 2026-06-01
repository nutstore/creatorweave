/**
 * PDF format UI handler — declares view modes and preview component
 * for FilePreview.
 */

import { lazy } from 'react'
import { registerFormatUI, getFormatHandler } from '../../format-registry'

registerFormatUI({
  extension: 'pdf',

  viewModes: [
    { id: 'preview', label: 'PDF', default: true },
    { id: 'text', label: 'Text' },
  ],

  PreviewComponent: lazy(() =>
    import('./Preview').then(m => ({ default: m.PdfPreview }))
  ),

  renderTextContent: async (data, path) => {
    const handler = getFormatHandler(path)
    if (!handler) throw new Error('No format handler for .pdf')
    const result = await handler.read(data, path)
    return result.content
  },
})
