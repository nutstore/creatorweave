/**
 * WebMCP tool name utilities.
 *
 * LLM providers (Azure OpenAI, OpenAI) restrict function names to [a-zA-Z0-9_-],
 * but hostnames contain `.` and port numbers contain `:`. We build a provider-safe
 * fullName at discovery time while preserving the original hostname and toolName
 * in the route cache for correct invocation.
 */

const MAX_PROVIDER_TOOL_NAME_LENGTH = 64
const SEPARATOR = '__'

/**
 * Normalize a string segment for inclusion in a provider-safe tool name.
 * Replaces any character outside [a-zA-Z0-9_-] with a single underscore,
 * collapses runs of underscores, and trims leading/trailing underscores.
 */
function normalizeSegment(value: string): string {
  const normalized = value
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'tool'
}

/**
 * FNV-1a 32-bit hash, returned as a zero-padded 8-char hex string.
 * Used as a collision-resistant suffix when the combined name exceeds
 * the provider's length limit.
 */
function fnv1aHex(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Build a provider-safe fullName from a hostname and toolName.
 *
 * Example:
 *   hostname = "pan-test.intra.local"
 *   toolName = "nutstore_browse"
 *   result   = "pan_test_intra_local__nutstore_browse"
 *
 * If the result exceeds 64 characters, it is truncated and a FNV-1a hash
 * suffix is appended to preserve uniqueness.
 */
export function buildSafeFullName(hostname: string, toolName: string): string {
  const safeHost = normalizeSegment(hostname)
  const safeTool = normalizeSegment(toolName)
  const base = `${safeHost}${SEPARATOR}${safeTool}`

  if (base.length <= MAX_PROVIDER_TOOL_NAME_LENGTH) {
    return base
  }

  // Truncate and append hash suffix for uniqueness.
  const suffix = fnv1aHex(`${hostname}\0${toolName}`)
  const budget = MAX_PROVIDER_TOOL_NAME_LENGTH - suffix.length - 1 // -1 for '_' before suffix
  return `${base.slice(0, Math.max(1, budget))}_${suffix}`
}
