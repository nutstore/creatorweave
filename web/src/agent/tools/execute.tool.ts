/**
 * python tool - Python code execution.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { pythonExecutor as runtimePythonExecutor } from '@/python'
import { getActiveConversation, useConversationContextStore } from '@/store/conversation-context.store'

//=============================================================================
// Tool Definition
//=============================================================================

export const pythonDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'python',
    description: `Execute Python code in browser.

LANGUAGE: python
- Runs via Pyodide (WebAssembly Python runtime)
- Built-in packages: pandas, numpy, matplotlib, openpyxl, pillow, scipy, sklearn
- For matplotlib: set matplotlib.use('Agg') BEFORE creating figures
- Files accessible at /mnt/ path (workspace OPFS directory)
- IMPORTANT: /mnt/ reads from OPFS, NOT directly from disk. If you see errors like "A requested file or directory could not be found", the file exists on disk but not in OPFS. Use \`sync(paths=["path/to/file"])\` to copy it to OPFS first, then retry.
- Project skill resources (.skills/ directory) are auto-synced to /mnt/.skills/{skill-dir}/ and can be imported directly
  Example: if .skills/word-processor/scripts/convert.py exists, use \`exec(open('/mnt/.skills/word-processor/scripts/convert.py').read())\` or \`import sys; sys.path.insert(0, '/mnt/.skills/word-processor/scripts')\`

Examples:
- python(code="print('hello')")`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python code to execute',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 60000)',
        },
      },
      required: ['code'],
    },
  },
}

export const pythonToolExecutor: ToolExecutor = async (args, _context) => {
  const code = args.code as string
  const timeout = (args.timeout as number) || 60000

  return executePython(code, timeout)
}

//=============================================================================
// Python Execution
//=============================================================================

async function executePython(code: string, timeout: number): Promise<string> {
  const active = await getActiveConversation()
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  try {
    const beforeSnapshot = await active.conversation.scanFilesWithCache()

    // Mount OPFS files/ directory to /mnt so Python writes sync to OPFS directly
    const filesDirHandle = await active.conversation.getFilesDir()

    // Execute Python code
    const result = await runtimePythonExecutor.execute({
      code,
      timeout,
      mountDir: filesDirHandle,
    })

    // Register OPFS delta into overlay ledger for pending/review/sync.
    await active.conversation.scanFilesWithCache()
    const detected = active.conversation.detectChanges(beforeSnapshot)
    if (detected.changes.length > 0) {
      await active.conversation.registerDetectedChanges(detected.changes)
    }
    await useConversationContextStore.getState().refreshPendingChanges(true)

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
    if (detected.changes.length > 0) {
      output += `\n[conversation] detected ${detected.changes.length} file change(s)`
    }

    return output.trim() || 'Execution completed'
  } catch (error) {
    if (error instanceof Error) {
      return JSON.stringify({ error: error.message })
    }
    return JSON.stringify({ error: String(error) })
  }
}
