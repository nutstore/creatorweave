/**
 * bash tool — Execute shell commands in a sandboxed bash environment.
 *
 * Uses just-bash (https://github.com/vercel-labs/just-bash) with a VfsBridgeFs
 * that connects to the existing OPFS + Native File System Access API stack.
 *
 * All file operations inside the bash session (cat, grep, sed, echo >, etc.)
 * go through the same VfsBackend used by read/write/edit tools — preserving
 * pending-change tracking, undo/redo, and sync preview.
 *
 * In Plan mode, the tool still runs but workspace writes are silently blocked
 * by wrapping the backend with a ReadOnlyBackend wrapper.
 */

import { toolOkJson, toolErrorJson } from './tool-envelope'
import type { ToolContext, ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import type { VfsBackend, VfsReadResult, VfsDirEntry, VfsReadOptions, VfsListOptions } from './vfs-backend'
import { VfsBridgeFs } from './just-bash-bridge'
import { resolveVfsTarget } from './vfs-resolver'
import { AssetsBackend } from './backends/assets-backend'
import { AgentBackend } from './backends/agent-backend'

/** Workspace mount point inside the bash sandbox (must match just-bash-bridge.ts) */
const WORKSPACE_MOUNT = '/workspace'

// ---------------------------------------------------------------------------
// Lazy-loaded just-bash (heavy module — only import when tool is actually used)
// ---------------------------------------------------------------------------

type BashInstance = {
  exec(commandLine: string, options?: any): Promise<{
    stdout: string
    stderr: string
    exitCode: number
    env?: Record<string, string>
  }>
  fs: any
}

type BashConstructor = new (options: any) => BashInstance

let BashClass: BashConstructor | null = null
let loadError: string | null = null
let loadErrorTime = 0
/** Retry loading after this many ms (prevents permanent failure on transient WASM issues) */
const LOAD_ERROR_TTL = 30_000

async function loadBash(): Promise<BashConstructor> {
  if (BashClass) return BashClass

  // Allow retry after TTL expires — a transient WASM load failure (e.g. OOM)
  // shouldn't permanently block the tool until page refresh.
  if (loadError && Date.now() - loadErrorTime < LOAD_ERROR_TTL) {
    throw new Error(loadError)
  }
  loadError = null

  try {
    const mod = await import('just-bash')
    BashClass = mod.Bash
    return BashClass!
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    loadError = `just-bash module not available: ${msg}`
    loadErrorTime = Date.now()
    throw new Error(loadError)
  }
}

// ---------------------------------------------------------------------------
// Read-only VfsBackend wrapper (for Plan mode)
// ---------------------------------------------------------------------------

/** Error thrown when a write operation is attempted in Plan mode. */
class PlanModeWriteBlockedError extends Error {
  constructor(operation: string, path: string) {
    super(`bash: ${path}: ${operation} blocked (read-only mode)`)
    this.name = 'PlanModeWriteBlockedError'
  }
}

class ReadOnlyBackend implements VfsBackend {
  readonly label = 'workspace' as const

  constructor(private inner: VfsBackend) {}

  async readFile(path: string, options?: VfsReadOptions): Promise<VfsReadResult> {
    return this.inner.readFile(path, options)
  }

  async writeFile(path: string, _content: string | ArrayBuffer | Blob): Promise<void> {
    // Throw a permission error so the bash command fails visibly
    throw new PlanModeWriteBlockedError('write', path)
  }

  async deleteFile(path: string): Promise<void> {
    throw new PlanModeWriteBlockedError('delete', path)
  }

  async deleteDir(path: string): Promise<{ deletedFiles: string[]; deletedDirs: string[] }> {
    throw new PlanModeWriteBlockedError('rm -r', path)
  }

  async listDir(path: string, options?: VfsListOptions): Promise<VfsDirEntry[]> {
    return this.inner.listDir(path, options)
  }

  async exists(path: string): Promise<boolean> {
    if (this.inner.exists) return this.inner.exists(path)
    try {
      await this.inner.readFile(path)
      return true
    } catch {
      return false
    }
  }

  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (this.inner.getDirectoryHandle) return this.inner.getDirectoryHandle()
    return null
  }
}

// ---------------------------------------------------------------------------
// Tool definition (OpenAI function-calling format)
// ---------------------------------------------------------------------------

export const bashDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'bash',
    description: [
      'Execute a bash command in a sandboxed environment with access to the workspace files.',
      'PREFER bash for batch operations, text processing pipelines, and multi-step file tasks — a single bash pipeline often replaces 5+ separate tool calls.',
      'Available: 79 commands including grep, sed, awk, cat, ls, find, sort, uniq, wc, head, tail, jq, diff, xargs, tr, cut, tee, rg, tree, gzip, file, split, rev.',
      'NOT available: git, node, npm, python3, curl, wget, tar, patch.',
      'Supports pipes (|), redirections (>, >>), and command chaining (&&, ||, ;).',
      'File operations go through the same system as read/write/edit tools — changes are tracked.',
      'Workspace files are accessible under /workspace/<rootName>/... (e.g. /workspace/myroot/src/app.ts).',
      'Assets accessible under /assets/... (e.g. ls /assets/, cat /assets/file.pdf).',
      'Agent files accessible under /agents/... (e.g. cat /agents/default/SOUL.md).',
      'Cross-root: cp /workspace/rootA/file /workspace/rootB/',
      'Python interop: Python writes to /mnt/, bash reads from /workspace/ (shared OPFS).',
      'Use bash for: text processing, data analysis, batch file operations, complex pipelines.',

    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The bash command(s) to execute. Supports multi-line scripts.',
        },
        timeout: {
          type: 'number',
          description: 'Maximum wall-clock execution time in milliseconds (default: 120000).',
        },
        cwd: {
          type: 'string',
          description: 'Working directory inside the sandbox (default: /workspace/<firstRootName>).',
        },
      },
      required: ['command'],
    },
  },
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

export const bashToolExecutor: ToolExecutor = async (
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<string> => {
  const command = args.command as string | undefined
  if (!command || typeof command !== 'string' || !command.trim()) {
    return toolErrorJson('bash', 'invalid_input', 'command is required and must be a non-empty string')
  }

  // Load just-bash dynamically
  let Bash: BashConstructor
  try {
    Bash = await loadBash()
  } catch (err) {
    return toolErrorJson('bash', 'module_not_available', (err as Error).message, {
      hint: 'just-bash is an optional dependency. Install it with: npm install just-bash',
    })
  }

  // Resolve VFS backend for workspace
  let backend: VfsBackend
  try {
    const target = await resolveVfsTarget('', context, 'read', { allowEmptyPath: true })
    backend = target.backend
  } catch (err) {
    return toolErrorJson('bash', 'no_workspace', 'No workspace available for bash execution', {
      details: { error: (err as Error).message },
    })
  }

  // In Plan mode, wrap backend to reject writes with visible errors
  // so the bash command fails and the user sees "read-only mode" feedback.
  // Fallback to 'act' if agentMode is not set (shouldn't happen normally).
  // NOTE: This is defense-in-depth — VfsBridgeFs also checks readOnly internally.
  // Two layers because ReadOnlyBackend protects at the VFS interface level,
  // while VfsBridgeFs.readOnly guards at the bridge-to-backend boundary.
  const isPlanMode = (context.agentMode ?? 'act') === 'plan'
  const effectiveBackend = isPlanMode ? new ReadOnlyBackend(backend) : backend

  // Resolve multi-root names
  let rootNames: string[] = []
  try {
    const { getProjectRootRepository } = await import(
      '@/sqlite/repositories/project-root.repository'
    )
    const repo = getProjectRootRepository()
    if (context.projectId) {
      const roots = await repo.findByProject(context.projectId)
      rootNames = roots.map((r: { name: string }) => r.name)
    }
  } catch {
    // Root repository not available — single root
  }

  // Create assets backend (for /assets mount inside the sandbox)
  let assetsBackend: VfsBackend | undefined
  try {
    assetsBackend = new AssetsBackend(context.workspaceId)
  } catch {
    // Assets not available — /assets will not be mounted
  }

  // Create agent backend (for /agents/<agentId>/... mount)
  let agentBackend: VfsBackend | undefined
  try {
    if (context.currentAgentId) {
      const { getAgentManager } = await import('@/opfs')
      const agentManager = await getAgentManager()
      agentBackend = new AgentBackend(agentManager, context.currentAgentId)
    }
  } catch {
    // Agent namespace not available — /agents will not be mounted
  }

  // Create bridge filesystem (readOnly flag is the authoritative guard)
  const bridgeFs = new VfsBridgeFs(effectiveBackend, rootNames, assetsBackend, agentBackend, { readOnly: isPlanMode })

  // Default cwd into the first root so relative paths always work.
  // Works for both single-root and multi-root: path always has rootName prefix.
  const defaultCwd = rootNames.length > 0
    ? `${WORKSPACE_MOUNT}/${rootNames[0]}`
    : WORKSPACE_MOUNT

  // Create bash instance with the bridged filesystem
  const bash: BashInstance = new Bash({
    fs: bridgeFs as any,
    cwd: defaultCwd,
    executionLimits: {
      maxCommandCount: 5000,
      maxLoopIterations: 10000,
      maxCallDepth: 50,
    },
  })

  // Execute the command with wall-clock timeout
  const startTime = Date.now()
  const timeoutMs = (args.timeout as number) || 120_000

  try {
    const cwd = (args.cwd as string) || defaultCwd

    // Race between execution and timeout
    const result = await Promise.race([
      bash.exec(command, { cwd }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`bash: command timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ])
    const elapsedMs = Date.now() - startTime

    // Truncate large outputs
    const MAX_OUTPUT = 50_000
    let stdout = result.stdout || ''
    let stderr = result.stderr || ''
    let truncated = false

    if (stdout.length > MAX_OUTPUT) {
      stdout = stdout.slice(0, MAX_OUTPUT) + `\n... truncated (${stdout.length} total chars)`
      truncated = true
    }
    if (stderr.length > MAX_OUTPUT) {
      stderr = stderr.slice(0, MAX_OUTPUT) + `\n... truncated (${stderr.length} total chars)`
      truncated = true
    }

    return toolOkJson('bash', {
      stdout,
      stderr,
      exitCode: result.exitCode,
      truncated,
      command,
      elapsedMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return toolErrorJson('bash', 'execution_error', `Bash execution failed: ${message}`, {
      details: { command, elapsedMs: Date.now() - startTime },
    })
  }
}

// ---------------------------------------------------------------------------
// Prompt doc for system prompt
// ---------------------------------------------------------------------------

export const bashPromptDoc: ToolPromptDoc = {
  category: 'file-ops',
  section: '### Shell',
  lines: [
    '- `bash(command, cwd?)` — Execute bash commands in a sandboxed environment',
    '  - Workspace at /workspace/<rootName>/... (e.g. /workspace/myroot/src/app.ts)',
    '  - Supports: grep, sed, awk, cat, ls, find, sort, uniq, wc, head, tail, jq, yq, etc.',
    '  - Supports pipes (`|`), redirections (`>`, `>>`), chaining (`&&`, `||`, `;`)',
    '  - File changes tracked through same system as write/edit tools',
    '  - Example: `bash(command="cat src/app.ts | grep TODO")`',
    '  - Example: `bash(command="find . -name \'*.ts\' | xargs grep -l \'TODO\'")`',
    '  - Example: `bash(command="jq \'.dependencies\' package.json")`',
  ],
}
