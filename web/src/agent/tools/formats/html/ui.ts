/**
 * HTML format UI handler — declares view modes and preview component
 * for FilePreview / FileDiffViewer.
 */

import { lazy } from 'react'
import { registerFormatUI } from '../../format-registry'

registerFormatUI({
  extension: 'html',

  viewModes: [
    { id: 'preview', label: 'Preview', labelKey: 'sidebar.fileDiffViewer.preview', default: true },
    { id: 'text', label: 'Source', labelKey: 'sidebar.fileDiffViewer.code' },
  ],

  PreviewComponent: lazy(() =>
    import('./Preview').then(m => ({ default: m.HtmlPreview }))
  ),

  // HTML is text — renderTextContent just decodes UTF-8
  renderTextContent: async (data) => {
    return new TextDecoder('utf-8').decode(data)
  },
})

// Also register .htm extension
registerFormatUI({
  extension: 'htm',

  viewModes: [
    { id: 'preview', label: 'Preview', labelKey: 'sidebar.fileDiffViewer.preview', default: true },
    { id: 'text', label: 'Source', labelKey: 'sidebar.fileDiffViewer.code' },
  ],

  PreviewComponent: lazy(() =>
    import('./Preview').then(m => ({ default: m.HtmlPreview }))
  ),

  renderTextContent: async (data) => {
    return new TextDecoder('utf-8').decode(data)
  },
})
