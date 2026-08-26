/**
 * Path Validator - validates and sanitizes file paths for WASM plugin access.
 *
 * Ensures plugins can only access files within the user-selected directory.
 */

/** Blocked file extensions that plugins should never write */
const BLOCKED_WRITE_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.vbs',
  '.msi',
  '.app',
  '.dmg',
  '.deb',
  '.rpm',
])

/** Sensitive file patterns that require extra caution */
const SENSITIVE_PATTERNS = [
  /^\.env/,
  /^\.ssh\//,
  /^\.git\/config$/,
  /^\.npmrc$/,
  /^\.pypirc$/,
  /credentials/i,
  /secret/i,
  /\.pem$/,
  /\.key$/,
  /\.cert$/,
]

/**
 * Validate a file path for safety.
 *
 * @returns null if valid, error string if invalid
 */
export function validatePath(path: string): string | null {
  // Must be non-empty
  if (!path || path.trim().length === 0) {
    return 'Path is empty'
  }

  // Normalize path separators
  const normalized = path.replace(/\\/g, '/')

  // Block absolute paths
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return 'Absolute paths are not allowed'
  }

  // Block path traversal
  if (normalized.includes('..')) {
    return 'Path traversal (..) is not allowed'
  }

  // Block null bytes
  if (normalized.includes('\0')) {
    return 'Null bytes in path are not allowed'
  }

  // Block excessively long paths
  if (normalized.length > 1024) {
    return 'Path exceeds maximum length (1024 chars)'
  }

  return null
}

/**
 * Check if writing to a path is allowed.
 *
 * @returns null if allowed, error string if blocked
 */
export function validateWritePath(path: string): string | null {
  const pathError = validatePath(path)
  if (pathError) return pathError

  // Check blocked extensions
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext && BLOCKED_WRITE_EXTENSIONS.has(`.${ext}`)) {
    return `Writing to .${ext} files is blocked for security`
  }

  return null
}

/**
 * Check if a path matches sensitive file patterns.
 */
export function isSensitivePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(normalized))
}

/**
 * Normalize a path by removing leading/trailing slashes and collapsing separators.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}
