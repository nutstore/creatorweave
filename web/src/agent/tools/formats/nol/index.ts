/**
 * NOL format module — registers both backend handler and UI handler.
 */

export { nolHandler } from './handler'
export { FormatWriteError } from './handler'

// UI registration (side-effect import — registers view modes + preview component)
import './ui'
