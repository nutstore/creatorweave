/**
 * Shared helpers for file discovery tools (glob/list_files).
 */

const GLOB_META_RE = /[*?[\]{}()!+@]/

/**
 * Dot-prefixed directories allowed in glob matching.
 * micromatch's `**` skips dot-prefixed segments by default;
 * directories listed here will enable `{ dot: true }` so they are traversed.
 */
export const DOT_GLOB_WHITELIST = new Set(['.skills'])

export const DEFAULT_EXCLUDED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.cache',
  '.turbo',
  '.pnpm-store',
])

export function normalizeSubPath(rawPath: unknown): string {
  if (typeof rawPath !== 'string') return ''
  const normalizedPath = rawPath.trim()
  if (
    normalizedPath === '' ||
    normalizedPath === '.' ||
    normalizedPath === './' ||
    normalizedPath === '/'
  ) {
    return ''
  }
  const subPath = normalizedPath.replace(/^\.?\//, '').replace(/\/+$/, '')
  const parts = subPath.split('/').filter(Boolean)
  if (parts.some((p) => p === '..')) {
    throw new Error('path cannot include ".."')
  }
  return parts.join('/')
}

export function parseBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

export function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function shouldSkipDirectory(
  dirName: string,
  includeIgnored: boolean,
  extraExcludes: string[]
): boolean {
  if (includeIgnored) return false
  return DEFAULT_EXCLUDED_DIRS.has(dirName) || extraExcludes.includes(dirName)
}

export function getStaticGlobPrefix(pattern: string): string {
  const normalized = pattern.trim().replace(/^\.?\//, '').replace(/\/+/g, '/')
  if (!normalized) return ''
  const parts = normalized.split('/').filter(Boolean)
  const prefix: string[] = []
  let encounteredMeta = false
  for (const part of parts) {
    if (GLOB_META_RE.test(part)) {
      encounteredMeta = true
      break
    }
    prefix.push(part)
  }

  // For exact-path patterns (no glob meta), only use the parent directory as
  // search root. Otherwise we'd try resolving a file name as a directory.
  if (!encounteredMeta && prefix.length > 0) {
    prefix.pop()
  }

  return prefix.join('/')
}

export async function resolveDirectoryHandle(
  root: FileSystemDirectoryHandle,
  subPath: string,
  options?: { allowMissing?: boolean }
): Promise<{ handle: FileSystemDirectoryHandle; exists: boolean }> {
  const allowMissing = options?.allowMissing ?? false
  if (!subPath) return { handle: root, exists: true }

  const parts = subPath.split('/').filter(Boolean)
  let current = root
  for (const part of parts) {
    if (part === '.') continue
    try {
      current = await current.getDirectoryHandle(part)
    } catch (error) {
      if (allowMissing) return { handle: root, exists: false }
      throw error
    }
  }
  return { handle: current, exists: true }
}

export async function readDirectoryEntriesSorted(dir: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
  const entries: FileSystemHandle[] = []
  for await (const [, handle] of dir.entries()) {
    entries.push(handle)
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}
