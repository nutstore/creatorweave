/**
 * NGM format module — registers both backend handler and UI handler.
 */

export { ngmHandler } from './handler'

// UI registration (side-effect import — registers view modes + preview component)
import './ui'
