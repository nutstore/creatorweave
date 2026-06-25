type ToolShape = {
  name: string
  inputSchema?: Record<string, unknown>
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (typeof value !== 'object') return JSON.stringify(value)

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`
}

function fnv1aHex(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildToolsetSignature(tools: ToolShape[]): string {
  const normalized = tools
    .map((tool) => ({
      name: tool.name.trim(),
      inputSchema: tool.inputSchema || { type: 'object', properties: {} },
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const payload = normalized
    .map((tool) => `${tool.name}:${stableStringify(tool.inputSchema)}`)
    .join('|')

  return fnv1aHex(payload)
}
