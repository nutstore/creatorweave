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

export function rejectPythonMountPath(toolName: string, path: unknown): string | null {
  if (typeof path !== 'string') return null
  if (!isPythonMountPath(path)) return null
  return toolErrorJson(
    toolName,
    'invalid_path_namespace',
    `Path "${path}" is a Python runtime mount path and cannot be used with ${toolName}.`,
    {
      hint:
        'Use python(code=...) for /mnt* paths. For non-python tools, use workspace-relative paths or vfs://workspace/... / vfs://assets/....',
      details: {
        invalid_path: path,
        python_only_prefixes: ['/mnt', '/mnt_assets'],
      },
    }
  )
}
