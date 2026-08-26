import { toolErrorJson } from './tool-envelope'
import type { ToolContext } from './tool-types'
import { isVfsPath } from './vfs-resolver'

function isPythonMountPath(input: string): boolean {
  const normalized = input.trim().replace(/\\/g, '/')
  return (
    normalized === '/mnt'
    || normalized.startsWith('/mnt/')
    || normalized === '/mnt_assets'
    || normalized.startsWith('/mnt_assets/')
  )
}

export interface NonPythonPathRewrite {
  rewrittenPath: string
  rewritten: boolean
}

export function rewritePythonMountPathForNonPythonTool(path: unknown): NonPythonPathRewrite | null {
  if (typeof path !== 'string') return null
  const normalized = path.trim().replace(/\\/g, '/')
  if (!isPythonMountPath(normalized)) return null

  // /mnt/{rootName}/... -> {rootName}/...
  if (normalized.startsWith('/mnt/')) {
    return {
      rewrittenPath: normalized.slice('/mnt/'.length),
      rewritten: true,
    }
  }

  // /mnt_assets/... -> vfs://assets/...
  if (normalized === '/mnt_assets') {
    return { rewrittenPath: 'vfs://assets/', rewritten: true }
  }
  if (normalized.startsWith('/mnt_assets/')) {
    return {
      rewrittenPath: `vfs://assets/${normalized.slice('/mnt_assets/'.length)}`,
      rewritten: true,
    }
  }

  // /mnt -> workspace root (empty relative path)
  if (normalized === '/mnt') {
    return { rewrittenPath: '', rewritten: true }
  }

  return null
}

export function rejectPythonMountPath(toolName: string, path: unknown): string | null {
  if (typeof path !== 'string') return null
  if (!isPythonMountPath(path)) return null
  const normalized = path.trim().replace(/\\/g, '/')
  const workspaceHint = normalized === '/mnt'
    ? '(workspace root)'
    : normalized.startsWith('/mnt/')
      ? normalized.slice('/mnt/'.length)
      : null
  const assetsHint = normalized === '/mnt_assets'
    ? 'vfs://assets/'
    : normalized.startsWith('/mnt_assets/')
      ? `vfs://assets/${normalized.slice('/mnt_assets/'.length)}`
      : null

  const hint =
    workspaceHint !== null
      ? `Non-python tools should use workspace paths directly: "${workspaceHint}". Example: "/mnt/{rootName}/src/a.ts" -> "{rootName}/src/a.ts".`
      : `Non-python tools should use vfs assets paths directly: "${assetsHint}".`

  return toolErrorJson(
    toolName,
    'invalid_path_namespace',
    `Path "${path}" is a Python runtime mount path and cannot be used with ${toolName}.`,
    {
      hint,
      details: {
        invalid_path: path,
        python_only_prefixes: ['/mnt', '/mnt_assets'],
        non_python_rewrite:
          workspaceHint !== null
            ? { from: path, to: workspaceHint }
            : { from: path, to: assetsHint },
      },
    }
  )
}

/**
 * Validate that a workspace-relative path includes a valid rootName prefix.
 * Returns an error JSON string if the path is missing the prefix, or null if OK.
 * Skips vfs:// paths (they have their own namespace routing) and non-workspace paths.
 */
export async function validateRootPrefix(
  toolName: string,
  path: string,
  context: ToolContext
): Promise<string | null> {
  // Skip vfs:// paths — they have their own namespace routing
  if (isVfsPath(path)) return null

  const projectId = context.projectId
  if (!projectId) return null

  try {
    const { getProjectRootRepository } = await import(
      '@/sqlite/repositories/project-root.repository'
    )
    const repo = getProjectRootRepository()
    const roots = await repo.findByProject(projectId)
    if (roots.length === 0) return null

    const rootNames = roots.map((r: { name: string }) => r.name)
    const firstSegment = path.replace(/\\/g, '/').split('/')[0]

    if (!firstSegment) return null

    // First segment matches a known root — valid
    if (rootNames.includes(firstSegment)) return null

    // No match — reject with helpful message
    return toolErrorJson(
      toolName,
      'missing_root_prefix',
      `Path "${path}" is missing a rootName prefix. All workspace paths must start with one of the mounted roots: ${rootNames.map((n: string) => `"${n}"`).join(', ')}.`,
      {
        hint: `Use the format "{rootName}/relative/path" — e.g. "${rootNames[0]}/${path}". Current mounted roots: ${rootNames.map((n: string) => `"${n}"`).join(', ')}.`,
        details: {
          invalid_path: path,
          mounted_roots: rootNames,
        },
      }
    )
  } catch {
    // If root lookup fails, don't block the operation
    return null
  }
}
