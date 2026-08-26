/**
 * Image format module — registers both backend handler and UI handler.
 */

export { imageHandler, IMAGE_EXTENSIONS, MIME_TYPES } from './handler'

// UI registration (side-effect import — registers view modes + preview component)
import './ui'
