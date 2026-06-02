/**
 * Format handler registration entry point.
 *
 * Import this module to register all built-in format handlers.
 * New formats should:
 *   1. Create a directory under formats/ (e.g. `formats/docx/`)
 *   2. Add handler.ts (FormatHandler), Preview.tsx (optional), ui.ts (optional)
 *   3. Register via registerFormatHandler() and registerFormatUI()
 *   4. Import and re-export from this file
 */

import { registerFormatHandler } from '../format-registry'
import { csvHandler } from './csv'
import { docxHandler } from './docx'
import { nbmxHandler } from './nbmx'
import { ngmHandler } from './ngm'
import { nolHandler } from './nol'
import { pdfHandler } from './pdf'
import { xlsxHandler } from './xlsx'
import { zipHandler } from './zip'

registerFormatHandler(csvHandler)
registerFormatHandler(docxHandler)
registerFormatHandler(nbmxHandler)
registerFormatHandler(ngmHandler)
registerFormatHandler(nolHandler)
registerFormatHandler(pdfHandler)
registerFormatHandler(xlsxHandler)
registerFormatHandler(zipHandler)
