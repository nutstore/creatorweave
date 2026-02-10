/**
 * run_python_code tool - Execute Python code in the browser using Pyodide
 *
 * Features:
 * - Execute arbitrary Python code with stdio capture
 * - Automatic file injection from user's active workspace
 * - Support for pandas, numpy, matplotlib, openpyxl packages
 * - Handle matplotlib image outputs
 * - Capture output files and bridge to OPFS
 * - Comprehensive error handling and timeout management
 *
 * Integration:
 * - Uses pythonExecutor singleton from @/python
 * - Bridges active files from agent store to Pyodide
 * - Maps output files back to user's workspace
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { pythonExecutor } from '@/python'
import type { FileRef as CoreFileRef } from '@/python/types'
import type { FileRef as WorkerFileRef } from '@/python/worker-types'

//=============================================================================
// Tool Definition
//=============================================================================

export const pythonCodeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'run_python_code',
    description: `Execute Python code in the browser using Pyodide.

IMPORTANT:
1. Specify file paths in the files parameter that your code needs
2. Files can be a string array or object array: ["file.xlsx"] or [{path: "file.xlsx"}]
3. Built-in packages (pandas, numpy, matplotlib, openpyxl) auto-load when imported
4. For other packages (scipy, scikit-learn, etc.), install via micropip first
5. For matplotlib: set matplotlib.use('Agg') BEFORE creating figures to run in headless mode

Examples:
- Simple computation:
  run_python_code(code="print(sum([1, 2, 3]))")

- Data analysis with pandas (built-in):
  run_python_code(code="import pandas as pd\\ndf = pd.read_csv('/mnt/data.csv')\\nprint(df.describe())", files: ["data.csv"])

- Install extra package then use:
  run_python_code(code="import micropip\\nawait micropip.install('openpyxl')\\nimport pandas as pd\\ndf = pd.read_excel('/mnt/file.xlsx')\\nprint(df.head())", files: ["file.xlsx"])

- Data visualization (headless mode):
  run_python_code(code="import matplotlib\\nmatplotlib.use('Agg')\\nimport matplotlib.pyplot as plt\\nplt.plot([1, 2, 3])\\nplt.savefig('/mnt/chart.png')", files: ["data.csv"])`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python code to execute. Access files via /mnt/{filename}.',
        },
        files: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'List of file paths to inject into /mnt. Code accesses them via /mnt/{filename}.',
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
  // Support both string array ["file.xlsx"] and object array [{path: "file.xlsx"}]
  const rawFiles = args.files as (string | { path: string })[] | undefined
  const timeout = (args.timeout as number) || 30000

  if (!code || typeof code !== 'string') {
    return JSON.stringify({ error: 'code is required and must be a string' })
  }

  if (code.length > 100000) {
    return JSON.stringify({
      error: `Code is too large (${code.length} bytes). Maximum size is 100KB.`,
    })
  }

  // Check if code references /mnt/ files but no files parameter provided
  const mentionsMnt =
    code.includes('/mnt/') ||
    code.includes('pd.read_excel') ||
    code.includes('pd.read_csv') ||
    code.includes('open(') ||
    code.includes('pd.read_json')
  if (mentionsMnt && (!rawFiles || rawFiles.length === 0)) {
    return JSON.stringify({
      error: 'Code references files in /mnt/ but no files parameter provided.',
      hint: 'Pass file paths in the files array, e.g., files: ["data.csv"]',
    })
  }

  try {
    // Get active files if not explicitly specified
    const activeFiles: CoreFileRef[] = []
    if (rawFiles && rawFiles.length > 0) {
      const { useAgentStore } = await import('@/store/agent.store')
      const directoryHandle = useAgentStore.getState().directoryHandle

      if (!directoryHandle) {
        return JSON.stringify({
          error: 'No directory selected. Please select a project folder first.',
        })
      }

      const { useOPFSStore } = await import('@/store/opfs.store')
      const { readFile } = useOPFSStore.getState()

      for (const file of rawFiles) {
        // Support both string: "file.xlsx" and object: {path: "file.xlsx"} formats
        const filePath = typeof file === 'string' ? file : file.path

        try {
          const { content } = await readFile(filePath, directoryHandle)

          // Convert content to FileRef format
          let fileContent: string
          if (typeof content === 'string') {
            fileContent = content
          } else if (content instanceof ArrayBuffer) {
            const decoder = new TextDecoder('utf-8')
            fileContent = decoder.decode(content)
          } else {
            const blob = content as Blob
            fileContent = await blob.text()
          }

          activeFiles.push({
            path: filePath,
            name: filePath.split('/').pop() || filePath,
            content: fileContent,
            contentType: 'text',
            size: fileContent.length,
            source: 'filesystem',
          })
        } catch (error) {
          console.warn(`[Python Tool] Failed to read file ${filePath}:`, error)
          return JSON.stringify({
            error: `Failed to read file: ${filePath}`,
            hint: 'Verify the file path matches the glob result exactly.',
          })
        }
      }
    }

    // Convert CoreFileRef to WorkerFileRef format for executor
    const workerFiles: WorkerFileRef[] = activeFiles.map((file) => {
      let content: ArrayBuffer
      if (typeof file.content === 'string') {
        const encoder = new TextEncoder()
        const uint8Array = encoder.encode(file.content)
        content = new ArrayBuffer(uint8Array.length)
        new Uint8Array(content).set(uint8Array)
      } else if (file.content instanceof Uint8Array) {
        content = new ArrayBuffer(file.content.length)
        new Uint8Array(content).set(file.content)
      } else {
        content = file.content as ArrayBuffer
      }

      return {
        name: file.name,
        content,
      }
    })

    // Execute Python code (Pyodide auto-loads packages)
    const result = await pythonExecutor.execute({
      code,
      files: workerFiles,
      timeout,
    })

    // Handle output files - save to workspace
    if (result.outputFiles && result.outputFiles.length > 0) {
      try {
        // Get directory handle and workspace
        const { useAgentStore } = await import('@/store/agent.store')
        const { getSessionManager } = await import('@/opfs/session')
        const { useWorkspaceStore } = await import('@/store/workspace.store')

        const directoryHandle = useAgentStore.getState().directoryHandle
        if (!directoryHandle) {
          console.warn('[Python Tool] No directory handle, skipping output file bridging')
        } else {
          const activeWorkspaceId = useWorkspaceStore.getState().activeWorkspaceId
          if (!activeWorkspaceId) {
            console.warn('[Python Tool] No active workspace, skipping output file bridging')
          } else {
            const manager = await getSessionManager()
            const workspace = await manager.getSession(activeWorkspaceId)
            if (workspace) {
              // Save each output file to workspace
              for (const outputFile of result.outputFiles) {
                try {
                  // Pass ArrayBuffer directly to preserve binary files (images, Excel, etc.)
                  await workspace.writeFile(outputFile.name, outputFile.content, directoryHandle)
                  console.log(
                    `[Python Tool] Saved output file: ${outputFile.name} (${outputFile.content.byteLength} bytes)`
                  )
                } catch (error) {
                  console.error(
                    `[Python Tool] Failed to save output file ${outputFile.name}:`,
                    error
                  )
                }
              }
            }
          }
        }
      } catch (error) {
        console.warn('[Python Tool] Failed to bridge output files:', error)
        // Continue - file bridging failure is not fatal
      }
    }

    // Format result for Agent
    if (!result.success) {
      return JSON.stringify({
        error: result.error || 'Execution failed',
        stderr: result.stderr,
        executionTime: result.executionTime,
      })
    }

    // Build response
    const response: {
      stdout?: string
      stderr?: string
      result?: unknown
      images?: Array<{ filename: string; data: string }>
      outputFiles?: Array<{ name: string; size: number }>
      executionTime: number
    } = {
      executionTime: result.executionTime,
    }

    if (result.stdout) {
      response.stdout = result.stdout
    }

    if (result.stderr) {
      response.stderr = result.stderr
    }

    if (result.result !== undefined && result.result !== null) {
      response.result = result.result
    }

    if (result.images && result.images.length > 0) {
      response.images = result.images
    }

    if (result.outputFiles && result.outputFiles.length > 0) {
      response.outputFiles = result.outputFiles.map(
        (f: { name: string; content: ArrayBuffer }) => ({
          name: f.name,
          size: f.content.byteLength,
        })
      )
    }

    return JSON.stringify(response, null, 2)
  } catch (error) {
    // Handle Pyodide loading errors
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (errorMessage.includes('Pyodide') || errorMessage.includes('loading')) {
      return JSON.stringify({
        error: 'Python environment is loading. Please wait a moment and try again.',
        details: errorMessage,
      })
    }

    return JSON.stringify({
      error: `Execution error: ${errorMessage}`,
    })
  }
}
