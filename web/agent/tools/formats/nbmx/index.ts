/**
 * NBMX format module — registers both backend handler and UI handler.
 */

export { nbmxHandler } from './handler'

// UI registration (side-effect import — registers view modes)
import './ui'
