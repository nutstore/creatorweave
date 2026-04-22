/**
 * Python Execution Constants - Configuration values for Pyodide integration
 *
 * Centralizes all configuration values for Python code execution:
 * - CDN URLs and versions
 * - Execution timeouts and limits
 * - Virtual filesystem configuration
 * - Available Python packages
 */

//=============================================================================
// Pyodide Configuration
//=============================================================================

/**
 * Pyodide files are served locally from /assets/pyodide
 * Dev: served from node_modules/pyodide via pyodideServePlugin
 * Prod: copied from node_modules/pyodide via copy:pyodide script
 */
export const PYODIDE_BASE_URL = '/assets/pyodide'

/**
 * Default execution timeout in milliseconds (3 minutes)
 * Prevents infinite loops from hanging the worker
 */
export const DEFAULT_TIMEOUT = 180000

/**
 * Virtual filesystem mount point in Pyodide
 * All injected files are mounted under this path
 */
export const MOUNT_POINT = '/mnt'

/**
 * Maximum file size for file injection (50MB)
 * Prevents memory exhaustion from large files
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024

//=============================================================================
// Python Packages
//=============================================================================

/**
 * Available Python packages that can be loaded
 * These are pre-compiled packages available in Pyodide
 */
export const PYTHON_PACKAGES = ['pandas', 'numpy', 'matplotlib', 'openpyxl'] as const

/**
 * Type for available Python package names
 */
export type PythonPackage = (typeof PYTHON_PACKAGES)[number]

//=============================================================================
// Validation Constants
//=============================================================================

/**
 * Maximum code size (1MB)
 * Prevents memory issues from large code blocks
 */
export const MAX_CODE_SIZE = 1024 * 1024

/**
 * Maximum number of files that can be injected
 * Prevents filesystem exhaustion
 */
export const MAX_FILE_COUNT = 100

/**
 * Maximum stdout/stderr buffer size (10MB)
 * Prevents memory issues from excessive output
 */
export const MAX_OUTPUT_SIZE = 10 * 1024 * 1024
