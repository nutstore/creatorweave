/**
 * python tool - Python code execution.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { pythonExecutor as runtimePythonExecutor } from '@/python'
import { getActiveConversation, useConversationContextStore } from '@/store/conversation-context.store'
import { useConversationStore } from '@/store/conversation.store'
import type { AssetMeta, FileSnapshot } from '@/types/asset'
import { inferMimeType } from '@/types/asset'

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
- Built-in packages (auto-loaded): pandas, numpy, matplotlib, openpyxl, pillow, scipy, sklearn
- For matplotlib: set matplotlib.use('Agg') BEFORE creating figures

Two mounted directories:
- \`/mnt/\` — workspace project files. Read/write project source files here. ALWAYS use /mnt/ prefix. Example: \`open('/mnt/output.csv', 'w')\`
- \`/mnt_assets/\` — asset files (user uploads & generated outputs). Read user-uploaded files and write output files for the user here. Example: \`pd.read_csv('/mnt_assets/data.csv')\`

Workspace files are accessible under \`/mnt/{rootName}/path/to/file\` (always include rootName).

Important:
- The default working directory is /home/pyodide, which is NOT synced. Files written there will be lost.
- /mnt/ reads from OPFS, NOT directly from disk. If you see "A requested file or directory could not be found", the file exists on disk but not in OPFS. Use \`sync(paths=["path/to/file"])\` to copy it to OPFS first, then retry.
- For user-uploaded files (CSV, images, etc.), read from /mnt_assets/.
- For output files you want the user to see (charts, reports), write to /mnt_assets/.
- Project skill scripts in .skills/ directory are auto-synced and can be imported directly.
  Example (root "lxy"): \`exec(open('/mnt/lxy/.skills/word-processor/scripts/convert.py').read())\`
  For imports, add the matching scripts directory to \`sys.path\` first.
- For packages NOT in the built-in list, use micropip to install from PyPI before importing:
  Example: \`import micropip; await micropip.install('requests'); import requests\`
  Note: Only pure-Pinux packages work with micropip. C-extension packages must be pre-built in Pyodide.

Examples:
- python(code="print('hello')")
- python(code="import micropip\\nawait micropip.install('beautifulsoup4')\\nfrom bs4 import BeautifulSoup\\nprint(BeautifulSoup('<h1>Hello</h1>', 'html.parser').h1.text)")`,
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

export const pythonToolExecutor: ToolExecutor = async (args, context) => {
  const code = args.code as string
  const timeout = (args.timeout as number) || 60000

  return executePython(code, timeout, context.directoryHandle)
}

//=============================================================================
// Python Execution
//=============================================================================

async function executePython(
  code: string,
  timeout: number,
  directoryHandle?: FileSystemDirectoryHandle | null
): Promise<string> {
  const active = await getActiveConversation()
  if (!active) {
    return JSON.stringify({ error: 'No active workspace' })
  }

  try {
    const beforeSnapshot = await active.conversation.scanFilesWithCache()

    // Mount OPFS files/ directory to /mnt so Python writes sync to OPFS directly
    const filesDirHandle = await active.conversation.getFilesDir()

    // Mount OPFS assets/ directory to /mnt_assets for asset file I/O
    const assetsDirHandle = await active.conversation.getAssetsDir()

    // Take assets snapshot BEFORE execution
    const beforeAssets = await snapshotAssetsDir(assetsDirHandle)

    // Execute Python code
    const result = await runtimePythonExecutor.execute({
      code,
      timeout,
      mountDir: filesDirHandle,
      assetsDir: assetsDirHandle,
    })

    // Register OPFS delta into overlay ledger for pending/review/sync.
    await active.conversation.scanFilesWithCache()
    const detected = active.conversation.detectChanges(beforeSnapshot)
    if (detected.changes.length > 0) {
      await active.conversation.registerDetectedChanges(detected.changes, directoryHandle)
    }
    await useConversationContextStore.getState().refreshPendingChanges(true)

    // Take assets snapshot AFTER execution and diff
    const afterAssets = await snapshotAssetsDir(assetsDirHandle)
    const newAssets = diffAssets(beforeAssets, afterAssets)

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
    if (newAssets.length > 0) {
      output += `\n[assets] generated ${newAssets.length} file(s): ${newAssets.map(a => a.name).join(', ')}`

      // Accumulate assets into the conversation store's collectedAssets
      // These will be attached to the final assistant message when the draft is committed
      const targetConvId = active.conversationId || useConversationStore.getState().activeConversationId
      if (targetConvId) {
        useConversationStore.getState().collectAssets(targetConvId, newAssets)
      } else {
        console.warn('[execute.tool] No conversationId! Assets will be lost.')
      }
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
// Assets Snapshot Helpers
//=============================================================================

/**
 * Scan the assets directory and build a snapshot map of filename → { size, lastModified }.
 * Does NOT read file contents — only fetches lightweight File metadata.
 */
async function snapshotAssetsDir(
  dirHandle: FileSystemDirectoryHandle
): Promise<FileSnapshot> {
  const snapshot: FileSnapshot = new Map()
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile()
      snapshot.set(entry.name, {
        size: file.size,
        lastModified: file.lastModified,
      })
    }
  }
  return snapshot
}

/**
 * Diff two snapshots and return AssetMeta[] for new or modified files.
 * Reads size from the after snapshot; generates a fresh id and timestamp.
 */
function diffAssets(
  before: FileSnapshot,
  after: FileSnapshot,
): AssetMeta[] {
  const assets: AssetMeta[] = []
  for (const [name, afterEntry] of after) {
    const beforeEntry = before.get(name)
    const isNew = !beforeEntry
    const isModified =
      beforeEntry !== undefined &&
      (beforeEntry.size !== afterEntry.size || beforeEntry.lastModified !== afterEntry.lastModified)

    if (isNew || isModified) {
      assets.push({
        id: crypto.randomUUID(),
        name,
        size: afterEntry.size,
        mimeType: inferMimeType(name),
        direction: 'generated',
        createdAt: Date.now(),
      })
    }
  }
  return assets
}
