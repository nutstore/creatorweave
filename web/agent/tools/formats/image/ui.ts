/**
 * Image format UI handler — declares view modes and preview component
 * for FilePreview.
 *
 * View modes:
 *   - preview: Enhanced image viewer (zoom, pan, rotate)
 *   - text: Image metadata (dimensions, format, size) via handler.read()
 */

import { lazy } from 'react'
import { registerFormatUI } from '../../format-registry'
import { imageHandler } from './handler'

// Register UI handlers for all supported image extensions.
// The handler is registered per-extension in formats/index.ts,
// and the UI needs to be registered for each extension so
// FilePreview can find the UI handler regardless of which
// image format is opened.

const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg'] as const

for (const ext of imageExtensions) {
  registerFormatUI({
    extension: ext,

    viewModes: [
      { id: 'preview', label: 'Image', default: true },
      { id: 'text', label: 'Info' },
    ],

    PreviewComponent: lazy(() =>
      import('./Preview').then(m => ({ default: m.ImagePreview }))
    ),

    renderTextContent: async (data, path) => {
      // Delegate to the shared image handler for metadata extraction
      const result = await imageHandler.read(data, path)
      return result.content
    },
  })
}
