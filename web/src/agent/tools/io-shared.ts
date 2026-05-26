/**
 * Shared helpers for read.tool.ts and write.tool.ts.
 * Extracted from io.tool.ts during split — no logic changes.
 */

import { withVfsAgentIdHint } from './vfs-resolver'

/**
 * Extract a stable resolved path string for loop guard tracking.
 * For workspace targets: uses the resolved absolute path.
 * For agent targets: constructs a synthetic path for tracking.
 */
export function getResolvedPathForLoopGuard(target: Awaited<ReturnType<typeof import('./vfs-resolver').resolveVfsTarget>>): string {
  if (target.backend.label === 'workspace') {
    return target.path
  }
  // For agent targets, construct a synthetic path
  return `vfs://agents/${(target as any).agentId}/${target.path}`
}

export function formatToolErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return withVfsAgentIdHint(raw)
}
