import type { BeforeToolCallHookContext, BeforeToolCallHookResult } from './agent-loop'

const PATH_ARG_KEYS = new Set([
  'path',
  'paths',
  'file',
  'file_path',
  'filePath',
  'target',
  'target_path',
  'targetPath',
  'output',
  'output_path',
  'outputPath',
  'old_path',
  'oldPath',
  'new_path',
  'newPath',
  'destination',
  'dest',
  'dir',
  'directory',
])

const MUTATING_TOOL_NAME = /(write|edit|delete|remove|rename|move|batch_edit|batch_write|sync)/i
const COMMAND_TOOL_NAME = /(bash|shell|terminal|command|exec)/i

const DEFAULT_PROTECTED_PATH_PATTERNS = [
  '.env',
  '.env.',
  '.git',
  '.ssh',
  'id_rsa',
  'id_ed25519',
  'node_modules',
]

const DEFAULT_DANGEROUS_COMMAND_PATTERNS = [
  /rm\s+-rf\s+\/($|\s)/i,
  /rm\s+-rf\s+~($|\s)/i,
  /:\(\)\s*\{\s*:\|:\s*&\s*\};\s*:/,
  /mkfs(\.| )/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt)\b/i,
  /(curl|wget)[^|]*\|\s*(sh|bash)\b/i,
]

export interface ToolPolicyConfig {
  enabled?: boolean
  enableDangerousCommandGuard?: boolean
  protectedPathPatterns?: string[]
  dangerousCommandPatterns?: RegExp[]
}

function normalizePathLike(input: string): string {
  return input.replace(/\\/g, '/').replace(/^\.\/+/, '').trim().toLowerCase()
}

function matchesProtectedPath(pathLike: string, protectedPatterns: string[]): boolean {
  const normalized = normalizePathLike(pathLike)
  for (const pattern of protectedPatterns) {
    const p = pattern.toLowerCase()
    if (normalized === p) return true
    if (normalized.startsWith(`${p}/`)) return true
    if (normalized.includes(`/${p}/`)) return true
    if (normalized.endsWith(`/${p}`)) return true
  }
  return false
}

function collectPathLikeValues(args: Record<string, unknown>): string[] {
  const found = new Set<string>()
  const stack: unknown[] = [args]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    if (typeof current === 'string') {
      continue
    }

    if (Array.isArray(current)) {
      for (const item of current) stack.push(item)
      continue
    }

    if (typeof current !== 'object') continue

    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (typeof value === 'string' && (PATH_ARG_KEYS.has(key) || key.toLowerCase().includes('path'))) {
        found.add(value)
        continue
      }
      if (Array.isArray(value) || (value && typeof value === 'object')) {
        stack.push(value)
      }
    }
  }

  return Array.from(found)
}

function extractCommand(args: Record<string, unknown>): string | null {
  const direct = ['command', 'cmd', 'shell_command', 'script']
  for (const key of direct) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function isMutatingTool(toolName: string): boolean {
  return MUTATING_TOOL_NAME.test(toolName)
}

function isCommandTool(toolName: string, args: Record<string, unknown>): boolean {
  if (COMMAND_TOOL_NAME.test(toolName)) return true
  return extractCommand(args) !== null
}

export function createToolPolicyHooks(config?: ToolPolicyConfig): {
  beforeToolCall: (context: BeforeToolCallHookContext) => BeforeToolCallHookResult | undefined
} {
  const enabled = config?.enabled !== false
  const enableDangerousCommandGuard = config?.enableDangerousCommandGuard === true
  const protectedPathPatterns = config?.protectedPathPatterns || DEFAULT_PROTECTED_PATH_PATTERNS
  const dangerousCommandPatterns = config?.dangerousCommandPatterns || DEFAULT_DANGEROUS_COMMAND_PATTERNS

  return {
    beforeToolCall: (context) => {
      if (!enabled) return undefined

      const toolName = context.toolName || ''
      const args = context.args || {}

      if (isMutatingTool(toolName)) {
        const pathCandidates = collectPathLikeValues(args)
        const blockedPath = pathCandidates.find((pathLike) =>
          matchesProtectedPath(pathLike, protectedPathPatterns)
        )
        if (blockedPath) {
          return {
            block: true,
            reason: `Blocked by tool policy: protected path "${blockedPath}" is not writable.`,
          }
        }
      }

      if (enableDangerousCommandGuard && isCommandTool(toolName, args)) {
        const command = extractCommand(args)
        if (command) {
          const blockedPattern = dangerousCommandPatterns.find((pattern) => pattern.test(command))
          if (blockedPattern) {
            return {
              block: true,
              reason: `Blocked by tool policy: command matched dangerous pattern "${blockedPattern.source}".`,
            }
          }
        }
      }

      return undefined
    },
  }
}
