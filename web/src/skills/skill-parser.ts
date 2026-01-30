/**
 * Skill Parser - parses SKILL.md format (YAML frontmatter + Markdown body).
 *
 * Format:
 * ```
 * ---
 * name: My Skill
 * version: "1.0.0"
 * description: Does something useful
 * author: Author Name
 * category: general
 * tags: [tag1, tag2]
 * triggers:
 *   keywords: [keyword1, keyword2]
 *   fileExtensions: [".ts", ".js"]
 * ---
 *
 * # Instruction
 * Main instruction content here...
 *
 * # Examples
 * Example content here...
 *
 * # Templates
 * Template content here...
 * ```
 */

import type { Skill, SkillCategory, SkillSource, SkillTrigger } from './skill-types'

/** Parse result */
interface ParseResult {
  skill: Skill | null
  error?: string
}

/**
 * Parse a SKILL.md string into a Skill object.
 */
export function parseSkillMd(content: string, source: SkillSource = 'import'): ParseResult {
  const trimmed = content.trim()
  if (!trimmed.startsWith('---')) {
    return { skill: null, error: 'Missing YAML frontmatter (must start with ---)' }
  }

  const endIndex = trimmed.indexOf('---', 3)
  if (endIndex === -1) {
    return { skill: null, error: 'Unclosed YAML frontmatter (missing closing ---)' }
  }

  const yamlBlock = trimmed.substring(3, endIndex).trim()
  const body = trimmed.substring(endIndex + 3).trim()

  // Parse YAML frontmatter (lightweight parser, no external dependency)
  const meta = parseSimpleYaml(yamlBlock)
  if (!meta.name) {
    return { skill: null, error: 'Missing required field: name' }
  }

  // Parse markdown body into sections
  const sections = parseMarkdownSections(body)

  const now = Date.now()
  const name = String(meta.name)
  const id = meta.id ? String(meta.id) : slugify(name)

  const triggers = parseTriggers(meta.triggers)

  const skill: Skill = {
    id,
    name,
    version: meta.version ? String(meta.version) : '1.0.0',
    description: meta.description ? String(meta.description) : '',
    author: meta.author ? String(meta.author) : 'Unknown',
    category: validateCategory(meta.category),
    tags: parseStringArray(meta.tags),
    source,
    triggers,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    instruction: sections.instruction || body, // fallback: entire body is instruction
    examples: sections.examples || undefined,
    templates: sections.templates || undefined,
  }

  return { skill }
}

/**
 * Serialize a Skill back to SKILL.md format.
 */
export function serializeSkillMd(skill: Skill): string {
  const lines: string[] = ['---']

  lines.push(`name: "${escapeYamlString(skill.name)}"`)
  lines.push(`version: "${skill.version}"`)
  if (skill.description) {
    lines.push(`description: "${escapeYamlString(skill.description)}"`)
  }
  lines.push(`author: "${escapeYamlString(skill.author)}"`)
  lines.push(`category: ${skill.category}`)
  if (skill.tags.length > 0) {
    lines.push(`tags: [${skill.tags.map((t) => `"${escapeYamlString(t)}"`).join(', ')}]`)
  }

  // Triggers
  lines.push('triggers:')
  if (skill.triggers.keywords.length > 0) {
    lines.push(
      `  keywords: [${skill.triggers.keywords.map((k) => `"${escapeYamlString(k)}"`).join(', ')}]`
    )
  }
  if (skill.triggers.fileExtensions && skill.triggers.fileExtensions.length > 0) {
    lines.push(
      `  fileExtensions: [${skill.triggers.fileExtensions.map((e) => `"${e}"`).join(', ')}]`
    )
  }

  lines.push('---')
  lines.push('')

  // Body sections
  lines.push('# Instruction')
  lines.push(skill.instruction)

  if (skill.examples) {
    lines.push('')
    lines.push('# Examples')
    lines.push(skill.examples)
  }

  if (skill.templates) {
    lines.push('')
    lines.push('# Templates')
    lines.push(skill.templates)
  }

  return lines.join('\n') + '\n'
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Lightweight YAML parser - handles flat key-value pairs and simple nested objects */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')
  let currentKey = ''
  let currentIndentObj: Record<string, unknown> | null = null

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue

    const indent = line.length - line.trimStart().length
    const trimmedLine = line.trim()

    // Nested key (indented under a parent)
    if (indent >= 2 && currentKey && currentIndentObj) {
      const colonIdx = trimmedLine.indexOf(':')
      if (colonIdx > 0) {
        const key = trimmedLine.substring(0, colonIdx).trim()
        const value = trimmedLine.substring(colonIdx + 1).trim()
        currentIndentObj[key] = parseYamlValue(value)
      }
      continue
    }

    // Top-level key
    const colonIdx = trimmedLine.indexOf(':')
    if (colonIdx > 0) {
      const key = trimmedLine.substring(0, colonIdx).trim()
      const value = trimmedLine.substring(colonIdx + 1).trim()

      if (!value) {
        // Object start (e.g. "triggers:")
        currentKey = key
        currentIndentObj = {}
        result[key] = currentIndentObj
      } else {
        currentKey = ''
        currentIndentObj = null
        result[key] = parseYamlValue(value)
      }
    }
  }

  return result
}

/** Parse a single YAML value (string, number, boolean, array) */
function parseYamlValue(value: string): unknown {
  // Array: [item1, item2]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (!inner) return []
    return inner.split(',').map((item) => {
      const trimmed = item.trim()
      // Remove quotes
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1)
      }
      return trimmed
    })
  }

  // Quoted string
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  // Boolean
  if (value === 'true') return true
  if (value === 'false') return false

  // Number
  const num = Number(value)
  if (!isNaN(num) && value !== '') return num

  return value
}

/** Parse Markdown into named sections by H1 headings */
function parseMarkdownSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const headingRegex = /^#\s+(.+)$/gm
  const matches: { name: string; start: number; end: number }[] = []

  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(body)) !== null) {
    matches.push({
      name: match[1].trim().toLowerCase(),
      start: match.index + match[0].length,
      end: body.length, // will be updated
    })
  }

  // Set end positions
  for (let i = 0; i < matches.length - 1; i++) {
    matches[i].end = matches[i + 1].start - matches[i + 1].name.length - 2 // account for "# "
    // Find the actual position of next heading
    const nextHeadingPos = body.lastIndexOf('#', matches[i + 1].start)
    if (nextHeadingPos > matches[i].start) {
      matches[i].end = nextHeadingPos
    }
  }

  for (const section of matches) {
    sections[section.name] = body.substring(section.start, section.end).trim()
  }

  return sections
}

/** Convert name to URL-safe slug */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Validate and normalize category */
function validateCategory(value: unknown): SkillCategory {
  const valid: SkillCategory[] = [
    'code-review',
    'testing',
    'debugging',
    'refactoring',
    'documentation',
    'security',
    'performance',
    'architecture',
    'general',
  ]
  if (typeof value === 'string' && valid.includes(value as SkillCategory)) {
    return value as SkillCategory
  }
  return 'general'
}

/** Parse a value as string array */
function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(',').map((s) => s.trim())
  return []
}

/** Parse triggers from frontmatter */
function parseTriggers(value: unknown): SkillTrigger {
  const defaultTrigger: SkillTrigger = { keywords: [] }
  if (!value || typeof value !== 'object') return defaultTrigger

  const obj = value as Record<string, unknown>
  return {
    keywords: parseStringArray(obj.keywords),
    fileExtensions: obj.fileExtensions ? parseStringArray(obj.fileExtensions) : undefined,
  }
}

/** Escape special characters for YAML string output */
function escapeYamlString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
