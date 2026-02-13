/**
 * run_python_code tool - Execute Python code in the browser using Pyodide
 *
 * Features:
 * - Execute arbitrary Python code with stdio capture
 * - Access files in OPFS workspace at /mnt path
 * - Automatic package loading from imports (pandas, numpy, matplotlib, openpyxl, etc.)
 * - Handle matplotlib image outputs
 * - Change detection after execution (scan files before/after)
 * - Comprehensive error handling and timeout management
 *
 * Architecture:
 * - Uses pythonExecutor singleton from @/python
 * - Mounts OPFS files/ subdirectory at /mnt using mountNativeFS
 * - Dual-layer storage: OPFS (workspace) + Native FS (user's project)
 * - Lazy loading: files copied from Native FS to OPFS on first read
 * - Change detection: compare file snapshots before/after execution
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { pythonExecutor } from '@/python'
import { getActiveWorkspace, useWorkspaceStore } from '@/store/workspace.store'

//=============================================================================
// Debounce Timer for Pending Changes Refresh
//=============================================================================

/** Timer for debouncing refreshPendingChanges calls */
let pendingChangesRefreshTimer: ReturnType<typeof setTimeout> | null = null

/** Debounce interval in ms */
const PENDING_CHANGES_DEBOUNCE_MS = 1000

/**
 * Debounced refresh of pending changes list
 * Avoids refreshing too frequently after multiple Python executions
 */
function debouncedRefreshPendingChanges(): void {
  // Clear existing timer
  if (pendingChangesRefreshTimer) {
    clearTimeout(pendingChangesRefreshTimer)
  }

  // Set new timer
  pendingChangesRefreshTimer = setTimeout(async () => {
    try {
      await useWorkspaceStore.getState().refreshPendingChanges()
      console.log('[Python Tool] Pending changes refreshed after Python execution')
    } catch (error) {
      console.warn('[Python Tool] Failed to refresh pending changes:', error)
    }
  }, PENDING_CHANGES_DEBOUNCE_MS)
}

//=============================================================================
// Tool Definition
//=============================================================================

export const pythonCodeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_python_code',
    description: `Execute Python code in the browser using Pyodide (WebAssembly Python runtime).

ENVIRONMENT: Runs in browser via WebAssembly, not a full Python environment.
- Automatic change detection: all file changes are detected after execution
- Files are accessible at /mnt/ path (OPFS workspace subdirectory)
- Built-in packages: pandas, numpy, matplotlib, openpyxl, pillow, scipy, sklearn, etc.
- For other packages: use micropip.install('package-name')
- For matplotlib: set matplotlib.use('Agg') BEFORE creating figures (headless mode)
- Automatic change detection: all file changes are detected after execution

IMPORTANT:
1. Uses Origin Private File System (OPFS) at /mnt - no folder selection needed
2. All file changes are detected after execution by scanning workspace directory
3. Use files parameter to pre-load files from native filesystem (optional optimization)

Examples:
- Simple computation:
  run_python_code(code="print(sum([1, 2, 3]))")

- Data analysis with pandas:
  run_python_code(code="import pandas as pd\\ndf = pd.read_csv('/mnt/data.csv')\\nprint(df.describe())", files=["data.csv"])

- Data visualization (matplotlib outputs automatically detected):
  run_python_code(code="import matplotlib\\nmatplotlib.use('Agg')\\nimport matplotlib.pyplot as plt\\nplt.plot([1, 2, 3])\\nplt.savefig('/mnt/chart.png')")`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python code to execute. Access workspace files via /mnt/{path}.',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Optional: List of files to copy from native filesystem to OPFS before execution (e.g., ["data.csv", "src/utils.py"]).',
        },
        timeout: {
          type: 'number',
          description: 'Execution timeout in milliseconds (default: 30000, max: 120000).',
        },
      },
      required: ['code'],
    },
  },
}

//=============================================================================
// Tool Executor
//=============================================================================

export const pythonCodeExecutor: ToolExecutor = async (args, _context) => {
  const code = args.code as string
  const requiredFiles = (args.files as string[]) || []
  const timeout = (args.timeout as number) || 30000

  // Validation
  if (!code || typeof code !== 'string') {
    return JSON.stringify({ error: 'code is required and must be a string' })
  }

  if (code.length > 100000) {
    return JSON.stringify({
      error: `Code is too large (${code.length} bytes). Maximum size is 100KB.`,
    })
  }

  // Validate timeout range
  if (timeout < 1000) {
    return JSON.stringify({ error: 'Timeout must be at least 1000ms (1 second)' })
  }
  if (timeout > 120000) {
    return JSON.stringify({ error: 'Timeout cannot exceed 120000ms (120 seconds)' })
  }

  // Get active workspace
  const activeWorkspace = await getActiveWorkspace()
  if (!activeWorkspace) {
    return JSON.stringify({
      error: 'No active workspace. Please open a conversation first.',
    })
  }

  const { workspace } = activeWorkspace

  try {
    // Get OPFS root and get files/ subdirectory
    if (typeof navigator.storage === 'undefined' || !navigator.storage.getDirectory) {
      return JSON.stringify({
        error: 'Storage API is not supported in this browser',
      })
    }

    // Prepare files from Native FS to OPFS (if specified)
    if (requiredFiles.length > 0) {
      try {
        await workspace.prepareFiles(requiredFiles)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return JSON.stringify({
          error: `File preparation failed: ${message}`,
        })
      }
    }

    // Scan files before execution for change detection
    const beforeScan = await workspace.scanFiles()

    // Execute Python code with OPFS mounted at /mnt
    const result = await pythonExecutor.execute({
      code,
      mountDir: await workspace.getFilesDir(),
      timeout,
    })

    // Save collected matplotlib images to OPFS for sync tracking
    if (result.images && result.images.length > 0) {
      const filesDir = await workspace.getFilesDir()
      for (const image of result.images) {
        try {
          // Decode base64 and write to OPFS files/ directory
          const binaryString = atob(image.data)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          const imageHandle = await filesDir.getFileHandle(image.filename, { create: true })
          const writable = await imageHandle.createWritable()
          await writable.write(bytes)
          await writable.close()
          console.log(`[Python Tool] Saved image to OPFS: ${image.filename}`)
        } catch (error) {
          console.warn(`[Python Tool] Failed to save image ${image.filename} to OPFS:`, error)
        }
      }
    }

    // Scan files after execution (updates cache) and detect changes
    await workspace.scanFilesWithCache()
    const changes = workspace.detectChanges(beforeScan)

    // Format result for Agent
    if (!result.success) {
      // Refresh pending changes even on Python execution failure
      // (user may have created/modified files before the error)
      debouncedRefreshPendingChanges()

      return JSON.stringify({
        error: result.error || 'Execution failed',
        stderr: result.stderr,
        executionTime: result.executionTime,
      })
    }

    // Refresh pending changes list after successful execution (debounced)
    debouncedRefreshPendingChanges()

    const response = {
      stdout: result.stdout,
      stderr: result.stderr,
      result: result.result,
      images: result.images,
      executionTime: result.executionTime,
      // Include file changes detected during execution
      fileChanges: {
        changes: changes.changes,
        added: changes.added,
        modified: changes.modified,
        deleted: changes.deleted,
        totalChanges: changes.changes.length,
      },
    }

    return JSON.stringify(response, null, 2)
  } catch (error) {
    // Handle errors
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Pyodide loading errors
    if (errorMessage.includes('Pyodide') || errorMessage.includes('loading')) {
      return JSON.stringify({
        error: 'Python environment is loading. Please wait a moment and try again.',
        details: errorMessage,
      })
    }

    // Generic error
    return JSON.stringify({
      error: `Execution error: ${errorMessage}`,
    })
  }
}
