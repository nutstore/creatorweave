/**
 * Doc Generator
 * Generates Markdown documentation from parsed JSDoc/TSDoc items.
 */

import type { DocItem } from './jsdoc-parser'

/** Section types for documentation */
export type SectionType = 'api' | 'readme' | 'skill'

/** Represents a documentation section */
export interface DocSection {
  title: string
  content: string
  type: SectionType
}

/** Result of documentation generation */
export interface DocGenerationResult {
  file: string
  content: string
  sections: DocSection[]
}

/** Configuration for documentation generation */
export interface DocGeneratorConfig {
  /** Project name for headers */
  projectName?: string
  /** Version string */
  version?: string
  /** Base URL for links */
  baseUrl?: string
  /** Include table of contents */
  includeTOC?: boolean
  /** Include file paths */
  includeFilePaths?: boolean
}

/**
 * Main documentation generator class.
 */
export class DocGenerator {
  private config: DocGeneratorConfig

  constructor(config: DocGeneratorConfig = {}) {
    this.config = {
      projectName: 'Project',
      version: '1.0.0',
      includeTOC: true,
      includeFilePaths: true,
      ...config,
    }
  }

  /**
   * Generate complete documentation from parsed items.
   */
  generate(items: DocItem[], outputFile: string = 'documentation.md'): DocGenerationResult {
    const sections: DocSection[] = []

    // Group items by type
    const functions = items.filter((i) => i.type === 'function')
    const classes = items.filter((i) => i.type === 'class')
    const interfaces = items.filter((i) => i.type === 'interface')

    // Generate API documentation
    if (functions.length > 0 || classes.length > 0 || interfaces.length > 0) {
      sections.push({
        title: 'API Reference',
        content: this.generateAPISection(items),
        type: 'api',
      })
    }

    // Generate README-style overview
    sections.push({
      title: 'Overview',
      content: this.generateOverviewSection(items),
      type: 'readme',
    })

    // Generate skills (reusable documentation)
    const skills = this.generateSkillSections(items)
    sections.push(...skills)

    const content = this.assembleDocument(sections)

    return {
      file: outputFile,
      content,
      sections,
    }
  }

  /**
   * Generate API reference section.
   */
  private generateAPISection(items: DocItem[]): string {
    const lines: string[] = []

    // Functions
    const functions = items.filter((i) => i.type === 'function')
    if (functions.length > 0) {
      lines.push('## Functions\n')
      for (const fn of functions) {
        lines.push(this.generateFunctionDoc(fn))
        lines.push('')
      }
    }

    // Classes
    const classes = items.filter((i) => i.type === 'class')
    if (classes.length > 0) {
      lines.push('## Classes\n')
      for (const cls of classes) {
        lines.push(this.generateClassDoc(cls))
        lines.push('')
      }
    }

    // Interfaces
    const interfaces = items.filter((i) => i.type === 'interface')
    if (interfaces.length > 0) {
      lines.push('## Interfaces\n')
      for (const iface of interfaces) {
        lines.push(this.generateInterfaceDoc(iface))
        lines.push('')
      }
    }

    // Type Aliases
    const types = items.filter((i) => i.type === 'type')
    if (types.length > 0) {
      lines.push('## Type Aliases\n')
      for (const type of types) {
        lines.push(this.generateTypeDoc(type))
        lines.push('')
      }
    }

    // React Hooks
    const hooks = items.filter((i) => i.type === 'hook')
    if (hooks.length > 0) {
      lines.push('## React Hooks\n')
      for (const hook of hooks) {
        lines.push(this.generateHookDoc(hook))
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  /**
   * Generate function documentation.
   */
  private generateFunctionDoc(item: DocItem): string {
    const lines: string[] = []

    // Signature
    const params =
      item.signature?.params
        .map((p) => {
          const opt = p.optional ? '?' : ''
          return `${p.name}${opt}: ${p.type}`
        })
        .join(', ') || ''

    const signature = `\`\`\`typescript\nfunction ${item.name}(${params}): ${item.signature?.returnType || 'void'}\n\`\`\``
    lines.push(`### \`${item.name}\``)
    lines.push('')
    lines.push(signature)
    lines.push('')

    // Description
    if (item.comment?.description) {
      lines.push(`**Description:** ${item.comment.description}`)
      lines.push('')
    }

    // Parameters from JSDoc
    const paramTags = item.comment?.tags.filter((t) => t.tag === 'param') || []
    if (paramTags.length > 0) {
      lines.push('**Parameters:**')
      lines.push('')
      for (const param of paramTags) {
        lines.push(`- \`${param.name}\` (${param.type || 'any'}): ${param.description || ''}`)
      }
      lines.push('')
    }

    // Returns
    const returns = item.comment?.tags.find((t) => t.tag === 'returns')
    if (returns) {
      lines.push(`**Returns:** \`${returns.type || 'void'}\` - ${returns.description || ''}`)
      lines.push('')
    }

    // Example
    const example = item.comment?.tags.find((t) => t.tag === 'example')
    if (example?.description) {
      lines.push('**Example:**')
      lines.push('')
      lines.push('```typescript')
      lines.push(example.description)
      lines.push('```')
      lines.push('')
    }

    // Location
    if (this.config.includeFilePaths) {
      lines.push(`*Defined in: \`${item.file}:${item.line}\`*`)
    }

    return lines.join('\n')
  }

  /**
   * Generate class documentation.
   */
  private generateClassDoc(item: DocItem): string {
    const lines: string[] = []

    lines.push(`### \`class ${item.name}\``)
    lines.push('')

    if (item.comment?.description) {
      lines.push(`**Description:** ${item.comment.description}`)
      lines.push('')
    }

    // Example
    const example = item.comment?.tags.find((t) => t.tag === 'example')
    if (example?.description) {
      lines.push('**Example:**')
      lines.push('')
      lines.push('```typescript')
      lines.push(example.description)
      lines.push('```')
      lines.push('')
    }

    if (this.config.includeFilePaths) {
      lines.push(`*Defined in: \`${item.file}:${item.line}\`*`)
    }

    return lines.join('\n')
  }

  /**
   * Generate interface documentation.
   */
  private generateInterfaceDoc(item: DocItem): string {
    const lines: string[] = []

    lines.push(`### \`interface ${item.name}\``)
    lines.push('')

    if (item.comment?.description) {
      lines.push(`**Description:** ${item.comment.description}`)
      lines.push('')
    }

    if (this.config.includeFilePaths) {
      lines.push(`*Defined in: \`${item.file}:${item.line}\`*`)
    }

    return lines.join('\n')
  }

  /**
   * Generate type alias documentation.
   */
  private generateTypeDoc(item: DocItem): string {
    const lines: string[] = []

    lines.push(`### \`type ${item.name}\``)
    lines.push('')

    if (item.comment?.description) {
      lines.push(`**Description:** ${item.comment.description}`)
      lines.push('')
    }

    if (this.config.includeFilePaths) {
      lines.push(`*Defined in: \`${item.file}:${item.line}\`*`)
    }

    return lines.join('\n')
  }

  /**
   * Generate React hook documentation.
   */
  private generateHookDoc(item: DocItem): string {
    const lines: string[] = []

    // Signature
    const params =
      item.signature?.params
        .map((p) => {
          const opt = p.optional ? '?' : ''
          return `${p.name}${opt}: ${p.type}`
        })
        .join(', ') || ''

    const signature = `\`\`\`typescript\nconst ${item.name} = (${params}): ${item.signature?.returnType || 'any'}\n\`\`\``
    lines.push(`### \`${item.name}\``)
    lines.push('')
    lines.push(signature)
    lines.push('')

    if (item.comment?.description) {
      lines.push(`**Description:** ${item.comment.description}`)
      lines.push('')
    }

    // Parameters from JSDoc
    const paramTags = item.comment?.tags.filter((t) => t.tag === 'param') || []
    if (paramTags.length > 0) {
      lines.push('**Parameters:**')
      lines.push('')
      for (const param of paramTags) {
        lines.push(`- \`${param.name}\` (${param.type || 'any'}): ${param.description || ''}`)
      }
      lines.push('')
    }

    // Returns
    const returns = item.comment?.tags.find((t) => t.tag === 'returns')
    if (returns) {
      lines.push(`**Returns:** \`${returns.type || 'any'}\` - ${returns.description || ''}`)
      lines.push('')
    }

    if (this.config.includeFilePaths) {
      lines.push(`*Defined in: \`${item.file}:${item.line}\`*`)
    }

    return lines.join('\n')
  }

  /**
   * Generate overview/README section.
   */
  private generateOverviewSection(items: DocItem[]): string {
    const lines: string[] = []

    lines.push(`# ${this.config.projectName}`)
    lines.push('')
    lines.push(`*Version: ${this.config.version}*`)
    lines.push('')

    // Summary
    const functionCount = items.filter((i) => i.type === 'function').length
    const classCount = items.filter((i) => i.type === 'class').length
    const interfaceCount = items.filter((i) => i.type === 'interface').length
    const hookCount = items.filter((i) => i.type === 'hook').length

    lines.push('## Summary')
    lines.push('')
    lines.push(`| Type | Count |`)
    lines.push(`|------|-------|`)
    lines.push(`| Functions | ${functionCount} |`)
    lines.push(`| Classes | ${classCount} |`)
    lines.push(`| Interfaces | ${interfaceCount} |`)
    lines.push(`| Hooks | ${hookCount} |`)
    lines.push('')

    // Table of Contents
    if (this.config.includeTOC) {
      lines.push('## Table of Contents')
      lines.push('')
      if (functionCount > 0) {
        lines.push('- [Functions](#functions)')
      }
      if (classCount > 0) {
        lines.push('- [Classes](#classes)')
      }
      if (interfaceCount > 0) {
        lines.push('- [Interfaces](#interfaces)')
      }
      if (hookCount > 0) {
        lines.push('- [React Hooks](#react-hooks)')
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Generate skill sections for reusable documentation.
   */
  private generateSkillSections(items: DocItem[]): DocSection[] {
    const skills: DocSection[] = []

    // Generate skill for each documented function
    const documentedFunctions = items.filter((i) => i.type === 'function' && i.comment !== null)

    for (const fn of documentedFunctions) {
      const skillContent = this.generateSkillContent(fn)
      skills.push({
        title: `Skill: ${fn.name}`,
        content: skillContent,
        type: 'skill',
      })
    }

    return skills
  }

  /**
   * Generate skill content for a single item.
   */
  private generateSkillContent(item: DocItem): string {
    const lines: string[] = []

    lines.push('# Skill Documentation')
    lines.push('')
    lines.push(`## ${item.name}`)
    lines.push('')

    // Metadata
    lines.push('---')
    lines.push('metadata:')
    lines.push(`  name: "${item.name}"`)
    lines.push(`  type: "${item.type}"`)
    lines.push(`  file: "${item.file}"`)
    lines.push(`  line: ${item.line}`)
    lines.push('---')
    lines.push('')

    // Description
    if (item.comment?.description) {
      lines.push('## Description')
      lines.push('')
      lines.push(item.comment.description)
      lines.push('')
    }

    // Usage
    lines.push('## Usage')
    lines.push('')
    const params =
      item.signature?.params
        .map((p) => {
          const opt = p.optional ? '?' : ''
          return `${p.name}${opt}: ${p.type}`
        })
        .join(', ') || ''

    lines.push('```typescript')
    lines.push(`function ${item.name}(${params}): ${item.signature?.returnType || 'void'}`)
    lines.push('```')
    lines.push('')

    // Parameters
    const paramTags = item.comment?.tags.filter((t) => t.tag === 'param') || []
    if (paramTags.length > 0) {
      lines.push('## Parameters')
      lines.push('')
      for (const param of paramTags) {
        lines.push(
          `| \`${param.name}\` | \`${param.type || 'any'}\` | ${param.description || '-'} |`
        )
      }
      lines.push('')
    }

    // Returns
    const returns = item.comment?.tags.find((t) => t.tag === 'returns')
    if (returns) {
      lines.push('## Returns')
      lines.push('')
      lines.push(`Type: \`${returns.type || 'void'}\``)
      if (returns.description) {
        lines.push('')
        lines.push(returns.description)
      }
      lines.push('')
    }

    // Example
    const example = item.comment?.tags.find((t) => t.tag === 'example')
    if (example?.description) {
      lines.push('## Example')
      lines.push('')
      lines.push('```typescript')
      lines.push(example.description)
      lines.push('```')
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Assemble complete document from sections.
   */
  private assembleDocument(sections: DocSection[]): string {
    const lines: string[] = []

    for (const section of sections) {
      lines.push(section.content)
      lines.push('\n---\n')
    }

    return lines.join('\n').trim()
  }

  /**
   * Generate documentation for a single item.
   */
  generateSingle(item: DocItem): string {
    switch (item.type) {
      case 'function':
        return this.generateFunctionDoc(item)
      case 'class':
        return this.generateClassDoc(item)
      case 'interface':
        return this.generateInterfaceDoc(item)
      case 'type':
        return this.generateTypeDoc(item)
      case 'hook':
        return this.generateHookDoc(item)
      default:
        return `### ${item.name}\n\n*Unknown type: ${item.type}*`
    }
  }
}

/**
 * Convenience function to generate documentation.
 */
export function generateDocumentation(
  items: DocItem[],
  outputFile?: string,
  config?: DocGeneratorConfig
): DocGenerationResult {
  const generator = new DocGenerator(config)
  return generator.generate(items, outputFile)
}

/**
 * Generate documentation for a single item.
 */
export function generateSingleDoc(item: DocItem, config?: DocGeneratorConfig): string {
  const generator = new DocGenerator(config)
  return generator.generateSingle(item)
}
