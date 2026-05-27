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
import { nolHandler } from './nol'
import { zipHandler } from './zip'

registerFormatHandler(nolHandler)
registerFormatHandler(zipHandler)
