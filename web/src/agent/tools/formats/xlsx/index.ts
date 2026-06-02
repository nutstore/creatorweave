/**
 * XLSX format module — registers both backend handler and UI handler.
 *
 * xlsx is removed from OfficePreview's OFFICE_EXTS so that format-registry
 * has full control over xlsx preview routing (text view via Markdown tables).
 */

export { xlsxHandler } from './handler'

// UI registration (side-effect import — registers text view mode)
import './ui'
