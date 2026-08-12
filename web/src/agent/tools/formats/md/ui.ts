/**
 * Markdown format UI handler — declares view modes and preview component
 * for FilePreview / FileDiffViewer.
 *
 * Default view mode is 'preview' (rendered markdown), with a 'text' mode
 * (Monaco editor) for source editing and inline comments.
 */

import { lazy } from 'react'
import { registerFormatUI } from '../../format-registry'

registerFormatUI({
  extension: 'md',

  viewModes: [
    { id: 'preview', label: 'Preview', labelKey: 'sidebar.fileDiffViewer.preview', default: true },
    { id: 'text', label: 'Source', labelKey: 'sidebar.fileDiffViewer.code' },
  ],

  PreviewComponent: lazy(() =>
    import('./Preview').then(m => ({ default: m.MarkdownPreview }))
  ),

  // Markdown is text — renderTextContent just decodes UTF-8
  renderTextContent: async (data) => {
    return new TextDecoder('utf-8').decode(data)
  },
})

// Also register .markdown extension
registerFormatUI({
  extension: 'markdown',

  viewModes: [
    { id: 'preview', label: 'Preview', labelKey: 'sidebar.fileDiffViewer.preview', default: true },
    { id: 'text', label: 'Source', labelKey: 'sidebar.fileDiffViewer.code' },
  ],

  PreviewComponent: lazy(() =>
    import('./Preview').then(m => ({ default: m.MarkdownPreview }))
  ),

  renderTextContent: async (data) => {
    return new TextDecoder('utf-8').decode(data)
  },
})
