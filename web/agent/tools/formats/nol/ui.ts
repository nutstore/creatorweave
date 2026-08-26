/**
 * NOL format UI handler — declares view modes and preview component
 * for FilePreview / FileDiffViewer.
 */

import { lazy } from 'react'
import { registerFormatUI, getFormatHandler } from '../../format-registry'

registerFormatUI({
  extension: 'nol',

  viewModes: [
    { id: 'preview', label: 'Outline', default: true },
    { id: 'text', label: 'Text' },
  ],

  PreviewComponent: lazy(() =>
    import('./Preview').then(m => ({ default: m.NolPreview }))
  ),

  renderTextContent: async (data, path) => {
    const handler = getFormatHandler(path)
    if (!handler) throw new Error('No format handler for .nol')
    const result = await handler.read(data, path)
    return result.content
  },
})
