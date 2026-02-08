/**
 * Documentation Templates
 * Reusable templates for generating Markdown documentation.
 */

/** Template context for interpolation */
export interface TemplateContext {
  /** Name of the item being documented */
  name: string
  /** Type of the item (function, class, interface, etc.) */
  type: string
  /** Description from JSDoc */
  description: string
  /** Parameters information */
  parameters: Array<{
    name: string
    type: string
    description: string
    optional: boolean
  }>
  /** Return type and description */
  returns?: {
    type: string
    description: string
  }
  /** Example code */
  example?: string
  /** File path */
  file: string
  /** Line number */
  line: number
  /** Additional metadata */
  metadata?: Record<string, string>
}

/**
 * Template renderer with variable substitution.
 */
export class TemplateRenderer {
  /**
   * Render a template string with context variables.
   */
  static render(template: string, context: TemplateContext): string {
    let result = template

    // Replace simple variables
    result = result.replace(/\{\{name\}\}/g, context.name)
    result = result.replace(/\{\{type\}\}/g, context.type)
    result = result.replace(/\{\{description\}\}/g, context.description || '')
    result = result.replace(/\{\{file\}\}/g, context.file)
    result = result.replace(/\{\{line\}\}/g, String(context.line))

    // Replace optional variables
    if (context.returns) {
      result = result.replace(/\{\{returns\.type\}\}/g, context.returns.type)
      result = result.replace(/\{\{returns\.description\}\}/g, context.returns.description)
    } else {
      result = result.replace(/\{\{returns\.type\}\}/g, 'void')
      result = result.replace(/\{\{returns\.description\}\}/g, '')
    }

    // Replace example
    if (context.example) {
      result = result.replace(/\{\{example\}\}/g, context.example)
    }

    // Replace parameters table
    if (context.parameters.length > 0) {
      const paramRows = context.parameters
        .map(
          (p) =>
            `| \`${p.name}\` | \`${p.type}\` | ${p.description || '-'} |${p.optional ? ' optional' : ''}`
        )
        .join('\n')
      result = result.replace(/\{\{parameters\.table\}\}/g, paramRows)
    } else {
      result = result.replace(/\{\{parameters\.table\}\}/g, '*No parameters*')
    }

    // Replace parameters list
    if (context.parameters.length > 0) {
      const paramList = context.parameters
        .map((p) => `- \`${p.name}\` (${p.type}): ${p.description || ''}`)
        .join('\n')
      result = result.replace(/\{\{parameters\.list\}\}/g, paramList)
    } else {
      result = result.replace(/\{\{parameters\.list\}\}/g, '*No parameters*')
    }

    // Replace signature
    const signature = this.buildSignature(context)
    result = result.replace(/\{\{signature\}\}/g, signature)

    return result
  }

  /**
   * Build function signature from parameters.
   */
  static buildSignature(context: TemplateContext): string {
    const params = context.parameters
      .map((p) => {
        const opt = p.optional ? '?' : ''
        return `${p.name}${opt}: ${p.type}`
      })
      .join(', ')

    const returnType = context.returns?.type || 'void'

    return `\`\`\`typescript\nfunction ${context.name}(${params}): ${returnType}\n\`\`\``
  }
}

/**
 * Predefined documentation templates.
 */
export const Templates = {
  /** Function documentation template */
  function: `
### \`{{name}}\`

{{signature}}

**Description:** {{description}}

{{#if parameters.length}}
**Parameters:**
{{parameters.table}}
{{/if}}

{{#if returns}}
**Returns:** \`{{returns.type}}\` - {{returns.description}}
{{/if}}

{{#if example}}
**Example:**
\`\`\`typescript
{{example}}
\`\`\`
{{/if}}

*Defined in: \`{{file}}:{{line}}\`*
`.trim(),

  /** Class documentation template */
  class: `
### \`class {{name}}\`

{{signature}}

**Description:** {{description}}

{{#if example}}
**Example:**
\`\`\`typescript
{{example}}
\`\`\`
{{/if}}

*Defined in: \`{{file}}:{{line}}\`*
`.trim(),

  /** Interface documentation template */
  interface: `
### \`interface {{name}}\`

**Description:** {{description}}

*Defined in: \`{{file}}:{{line}}\`*
`.trim(),

  /** Type alias documentation template */
  type: `
### \`type {{name}}\`

**Description:** {{description}}

*Defined in: \`{{file}}:{{line}}\`*
`.trim(),

  /** React hook documentation template */
  hook: `
### \`{{name}}\`

{{signature}}

**Description:** {{description}}

{{#if parameters.length}}
**Parameters:**
{{parameters.list}}
{{/if}}

{{#if returns}}
**Returns:** \`{{returns.type}}\` - {{returns.description}}
{{/if}}

*Defined in: \`{{file}}:{{line}}\`*
`.trim(),

  /** README header template */
  readmeHeader: `
# {{projectName}}

{{#if version}}
*Version: {{version}}*
{{/if}}

{{#if description}}
{{description}}
{{/if}}

{{#if includeTOC}}
## Table of Contents

{{#if hasFunctions}}
- [Functions](#functions)
{{/if}}
{{#if hasClasses}}
- [Classes](#classes)
{{/if}}
{{#if hasInterfaces}}
- [Interfaces](#interfaces)
{{/if}}
{{#if hasHooks}}
- [Hooks](#hooks)
{{/if}}
{{/if}}
`.trim(),

  /** API section template */
  apiSection: `
# API Reference

{{#if functions}}
## Functions

{{functions}}
{{/if}}

{{#if classes}}
## Classes

{{classes}}
{{/if}}

{{#if interfaces}}
## Interfaces

{{interfaces}}
{{/if}}

{{#if hooks}}
## React Hooks

{{hooks}}
{{/if}}
`.trim(),

  /** Skill metadata template */
  skillMetadata: `---
metadata:
  name: "{{name}}"
  type: "{{type}}"
  description: "{{description}}"
  file: "{{file}}"
  line: {{line}}
{{#if parameters}}
  parameters:
{{#each parameters}}
    - name: "{{name}}"
      type: "{{type}}"
{{#if description}}
      description: "{{description}}"
{{/if}}
{{/each}}
{{/if}}
{{#if returns}}
  returns:
    type: "{{returns.type}}"
{{#if returns.description}}
    description: "{{returns.description}}"
{{/if}}
{{/if}}
---
`.trim(),

  /** Summary table template */
  summaryTable: `
## Summary

| Type | Count |
|------|-------|
| Functions | {{functionCount}} |
| Classes | {{classCount}} |
| Interfaces | {{interfaceCount}} |
| Hooks | {{hookCount}} |
| Types | {{typeCount}} |
`.trim(),
}

/**
 * Template utilities for documentation generation.
 */
export const TemplateUtils = {
  /**
   * Get template by type.
   */
  getTemplate(type: keyof typeof Templates): string {
    return Templates[type]
  },

  /**
   * Render template with context.
   */
  render(template: string, context: TemplateContext): string {
    return TemplateRenderer.render(template, context)
  },

  /**
   * Render template by type name.
   */
  renderByType(type: keyof typeof Templates, context: TemplateContext): string {
    const template = Templates[type]
    return TemplateRenderer.render(template, context)
  },

  /**
   * Create context from DocItem.
   */
  createContext(item: {
    name: string
    type: string
    description?: string
    parameters?: Array<{ name: string; type: string; description?: string; optional?: boolean }>
    returns?: { type: string; description?: string }
    example?: string
    file: string
    line: number
  }): TemplateContext {
    return {
      name: item.name,
      type: item.type,
      description: item.description || '',
      parameters: (item.parameters || []).map((p) => ({
        name: p.name,
        type: p.type,
        description: p.description || '',
        optional: p.optional ?? false,
      })),
      returns: item.returns
        ? { type: item.returns.type, description: item.returns.description || '' }
        : undefined,
      example: item.example,
      file: item.file,
      line: item.line,
    }
  },
}

/**
 * Export all templates as a default object.
 */
export default Templates
