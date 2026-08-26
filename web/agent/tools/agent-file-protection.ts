/** Agent-owned files that delegated subagents must never access. */
export const PROTECTED_AGENT_CORE_FILES = new Set([
  'SOUL.md',
  'IDENTITY.md',
  'AGENTS.md',
  'USER.md',
  'MEMORY.md',
  'HEARTBEAT.md',
])

export const SUBAGENT_PERMISSION_DENIED = 'PERMISSION_DENIED'

export function isProtectedAgentCoreFile(path: string): boolean {
  return PROTECTED_AGENT_CORE_FILES.has(path)
}

export function isSubagentPermissionDenied(error: unknown): error is Error {
  return error instanceof Error && (
    error.message.startsWith(`${SUBAGENT_PERMISSION_DENIED}:`) ||
    error.message.startsWith('EACCES: delegated subagent')
  )
}
