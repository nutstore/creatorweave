import { toolErrorJson } from './tool-envelope'

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
