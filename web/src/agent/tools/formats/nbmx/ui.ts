/**
 * NBMX format UI handler — text view only.
 *
 * Mind map rendering as an interactive visual tree could be added later.
 * Currently the AI can read the full outline via the read tool.
 */

import { registerFormatUI, getFormatHandler } from '../../format-registry'

registerFormatUI({
  extension: 'nbmx',

  viewModes: [
    { id: 'text', label: 'Outline', default: true },
  ],

  renderTextContent: async (data, path) => {
    const handler = getFormatHandler(path)
    if (!handler) throw new Error('No format handler for .nbmx')
    const result = await handler.read(data, path)
    return result.content
  },
})
