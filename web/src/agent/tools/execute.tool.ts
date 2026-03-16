/**
 * execute tool - Unified code execution (Python/JavaScript).
 *
 * Combines run_python_code and run_javascript_code into one tool.
 * Uses 'language' parameter to select execution engine.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { pythonExecutor } from '@/python'
import { getActiveWorkspace, useWorkspaceStore } from '@/store/workspace.store'

//=============================================================================
// Tool Definition
//=============================================================================

export const executeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'execute',
    description: `Execute code in browser. Supports Python and JavaScript.

LANGUAGE: python
- Runs via Pyodide (WebAssembly Python runtime)
- Built-in packages: pandas, numpy, matplotlib, openpyxl, pillow, scipy, sklearn
- For matplotlib: set matplotlib.use('Agg') BEFORE creating figures
- Files accessible at /mnt/ path (workspace subdirectory)

LANGUAGE: javascript
- Runs in browser JavaScript engine
- Available: ES2024+, JSON, Math, Date, RegExp, Array/Object methods

Examples:
- Python: execute(language="python", code="print('hello')")
- JS: execute(language="javascript", code="console.log('hello')")`,
    parameters: {
      type: 'object',
      properties: {
        language: {
          type: 'string',
          enum: ['python', 'javascript'],
          description: 'Programming language to execute',
        },
        code: {
          type: 'string',
          description: 'Code to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 60000)',
        },
      },
      required: ['language', 'code'],
    },
  },
}

export const executeExecutor: ToolExecutor = async (args, _context) => {
  const language = args.language as 'python' | 'javascript'
  const code = args.code as string
  const timeout = (args.timeout as number) || 60000

  if (language === 'python') {
    return executePython(code, timeout)
  } else if (language === 'javascript') {
    return executeJavascript(code, timeout)
  }
  return JSON.stringify({ error: 'Unsupported language. Use "python" or "javascript".' })
}

//=============================================================================
// Python Execution
//=============================================================================

let pendingChangesRefreshTimer: ReturnType<typeof setTimeout> | null = null

async function executePython(code: string, timeout: number): Promise<string> {
  const workspace = getActiveWorkspace()
  if (!workspace) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  try {
    // Execute Python code
    const result = await pythonExecutor.execute({
      code,
      timeout,
    })

    // Debounced refresh of pending changes
    if (pendingChangesRefreshTimer) {
      clearTimeout(pendingChangesRefreshTimer)
    }
    pendingChangesRefreshTimer = setTimeout(() => {
      useWorkspaceStore.getState().refreshPendingChanges()
    }, 1000)

    // Format result as string
    let output = ''
    if (result.stdout) {
      output += result.stdout
    }
    if (result.stderr) {
      output += '\n' + result.stderr
    }
    if (result.error) {
      return JSON.stringify({ error: result.error })
    }
    if (result.result !== undefined) {
      output += '\n' + String(result.result)
    }

    return output.trim() || 'Execution completed'
  } catch (error) {
    if (error instanceof Error) {
      return JSON.stringify({ error: error.message })
    }
    return JSON.stringify({ error: String(error) })
  }
}

//=============================================================================
// JavaScript Execution
//=============================================================================

async function executeJavascript(code: string, timeout: number): Promise<string> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(JSON.stringify({ error: `Execution timed out after ${timeout}ms` }))
    }, timeout)

    try {
      // Create a sandboxed execution environment
      const logs: string[] = []
      const sandbox = {
        console: {
          log: (...args: unknown[]) => logs.push(args.map(String).join(' ')),
          error: (...args: unknown[]) => logs.push('ERROR: ' + args.map(String).join(' ')),
          warn: (...args: unknown[]) => logs.push('WARN: ' + args.map(String).join(' ')),
          info: (...args: unknown[]) => logs.push('INFO: ' + args.map(String).join(' ')),
        },
        Math,
        JSON,
        Date,
        RegExp,
        Array: Array.prototype,
        Object: Object.prototype,
        String: String.prototype,
        Number: Number.prototype,
        Boolean: Boolean.prototype,
        Map,
        Set,
        WeakMap,
        WeakSet,
        Promise,
        Symbol,
        Error,
        TypeError,
        RangeError,
        SyntaxError,
        URIError,
      }

      // Create function with sandboxed globals
      const fn = new Function(...Object.keys(sandbox), code)
      const result = fn(...Object.values(sandbox))

      clearTimeout(timeoutId)

      // Return result with logs
      let output = logs.join('\n')
      if (output && result !== undefined) {
        output += '\n' + String(result)
      } else if (result !== undefined) {
        output = String(result)
      } else if (logs.length === 0) {
        output = 'undefined'
      }

      resolve(output)
    } catch (error) {
      clearTimeout(timeoutId)
      resolve(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        })
      )
    }
  })
}
