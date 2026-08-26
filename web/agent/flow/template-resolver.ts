/**
 * Template resolver — replaces {{var}} placeholders in strings and objects.
 *
 * Supported variables:
 * - {{date}} / {{today}}  → YYYY-MM-DD (today)
 * - {{nodeId}}            → output of upstream node with that id
 * - {{input}}             → shortcut for the first upstream node's output
 */

const DATE_RE = /\{\{(date|today)\}\}/g
const NODE_REF_RE = /\{\{([a-zA-Z0-9_]+)\}\}/g

/** Format today's date as YYYY-MM-DD */
function todayStr(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Resolve date variables ({{date}}, {{today}}) in a single string.
 */
export function resolveDateVars(value: string): string {
  return value.replace(DATE_RE, todayStr())
}

/**
 * Resolve node reference variables ({{nodeId}}, {{input}}) in a string,
 * using the provided variable store.
 *
 * @param value     The template string
 * @param variables Map of variable name → resolved value (from NodeOutputStore)
 * @param inputAlias If provided, {{input}} resolves to this value
 */
export function resolveNodeVars(
  value: string,
  variables: Map<string, unknown>,
  inputAlias?: unknown
): string {
  return value.replace(NODE_REF_RE, (match, varName: string) => {
    if (varName === 'input' && inputAlias !== undefined) {
      return formatValue(inputAlias)
    }
    const val = variables.get(varName)
    return val !== undefined ? formatValue(val) : match
  })
}

/**
 * Resolve all template variables in a value (string, object, or array).
 * Handles date vars first, then node vars.
 */
export function resolveTemplateValue(
  value: unknown,
  variables: Map<string, unknown>,
  inputAlias?: unknown
): unknown {
  if (typeof value === 'string') {
    const dateResolved = resolveDateVars(value)
    return resolveNodeVars(dateResolved, variables, inputAlias)
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveTemplateValue(v, variables, inputAlias))
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = resolveTemplateValue(v, variables, inputAlias)
    }
    return result
  }
  return value
}

/**
 * Resolve all args in a tool/llm config object.
 */
export function resolveArgs(
  args: Record<string, unknown> | undefined,
  variables: Map<string, unknown>,
  inputAlias?: unknown
): Record<string, unknown> {
  if (!args) return {}
  const resolved = resolveTemplateValue(args, variables, inputAlias)
  return (resolved as Record<string, unknown>) ?? {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(val: unknown): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}
