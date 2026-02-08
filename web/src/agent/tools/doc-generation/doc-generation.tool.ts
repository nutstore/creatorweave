/**
 * Doc Generation Tool
 *
 * Generate Markdown documentation from JSDoc/TSDoc comments.
 * Supports API docs, README generation, and skill export formats.
 *
 * @module doc-generation-tool
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from '../tool-types'
import { JSDocParser, type DocItem } from './jsdoc-parser'
import { generateDocumentation, generateSingleDoc, type DocGenerationResult } from './doc-generator'

// ============================================================================
// Tool Arguments Types
// ============================================================================

/** Arguments for generate_markdown_docs tool */
export interface GenerateMarkdownDocsArgs {
  /** Source code to parse */
  code: string
  /** File path for reference */
  file_path?: string
  /** Output file name */
  output_file?: string
  /** Documentation type */
  doc_type?: 'api' | 'readme' | 'skill' | 'all'
  /** Project name */
  project_name?: string
  /** Version string */
  version?: string
  /** Include table of contents */
  include_toc?: boolean
  /** Include file paths in output */
  include_file_paths?: boolean
}

/** Arguments for generate_single_doc tool */
export interface GenerateSingleDocArgs {
  /** Source code containing the item */
  code: string
  /** Name of the item to document */
  item_name: string
  /** Item type (function, class, interface, type, hook) */
  item_type?: 'function' | 'class' | 'interface' | 'type' | 'hook' | 'auto'
  /** File path for reference */
  file_path?: string
}

/** Arguments for extract_docs tool */
export interface ExtractDocsArgs {
  /** Source code to parse */
  code: string
  /** Filter by type */
  filter_type?: 'function' | 'class' | 'interface' | 'type' | 'hook' | 'all'
  /** Only documented items */
  documented_only?: boolean
  /** File path for reference */
  file_path?: string
}

// ============================================================================
// Tool Definitions
// ============================================================================

export const generate_markdown_docs: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_markdown_docs',
    description:
      'Generate comprehensive Markdown documentation from JSDoc/TSDoc comments in source code. Supports API reference, README generation, and reusable skill format exports.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Source code containing JSDoc comments to parse',
        },
        file_path: {
          type: 'string',
          description: 'File path for reference and accurate source links',
        },
        output_file: {
          type: 'string',
          description: 'Output file name for the generated documentation',
        },
        doc_type: {
          type: 'string',
          enum: ['api', 'readme', 'skill', 'all'],
          description: 'Type of documentation to generate',
        },
        project_name: {
          type: 'string',
          description: 'Project name for documentation headers',
        },
        version: {
          type: 'string',
          description: 'Version string for documentation headers',
        },
        include_toc: {
          type: 'boolean',
          description: 'Include table of contents in output',
        },
        include_file_paths: {
          type: 'boolean',
          description: 'Include file paths in documentation',
        },
      },
      required: ['code'],
    },
  },
}

export const generate_single_doc: ToolDefinition = {
  type: 'function',
  function: {
    name: 'generate_single_doc',
    description:
      'Generate documentation for a single code item (function, class, interface, type, or hook) from JSDoc comments.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Source code containing the item to document',
        },
        item_name: {
          type: 'string',
          description: 'Name of the function, class, or interface to document',
        },
        item_type: {
          type: 'string',
          enum: ['function', 'class', 'interface', 'type', 'hook', 'auto'],
          description: 'Type of the item (auto-detected if not specified)',
        },
        file_path: {
          type: 'string',
          description: 'File path for reference in documentation',
        },
      },
      required: ['code', 'item_name'],
    },
  },
}

export const extract_docs: ToolDefinition = {
  type: 'function',
  function: {
    name: 'extract_docs',
    description:
      'Extract and parse JSDoc/TSDoc documentation items from source code without generating Markdown.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Source code to parse for documentation',
        },
        filter_type: {
          type: 'string',
          enum: ['function', 'class', 'interface', 'type', 'hook', 'all'],
          description: 'Filter to specific item types',
        },
        documented_only: {
          type: 'boolean',
          description: 'Only return items with JSDoc comments',
        },
        file_path: {
          type: 'string',
          description: 'File path for reference',
        },
      },
      required: ['code'],
    },
  },
}

// ============================================================================
// Tool Executors
// ============================================================================

/**
 * Execute generate_markdown_docs tool.
 */
export const generate_markdown_docs_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const code = args.code as string
    const filePath = (args.file_path as string) || 'unknown'
    const outputFile = (args.output_file as string) || 'documentation.md'
    const docType = (args.doc_type as 'api' | 'readme' | 'skill' | 'all') || 'all'
    const projectName = args.project_name as string
    const version = args.version as string
    const includeToc = (args.include_toc as boolean) ?? true
    const includeFilePaths = (args.include_file_paths as boolean) ?? true

    // Parse documentation items
    const items = JSDocParser.parseFile(code, filePath)

    // Generate documentation
    const result = generateDocumentation(items, outputFile, {
      projectName: projectName || 'Project Documentation',
      version: version || '1.0.0',
      includeTOC: includeToc,
      includeFilePaths: includeFilePaths,
    })

    // Filter by doc type if needed
    if (docType !== 'all') {
      result.sections = result.sections.filter((s) => s.type === docType)
      result.content = result.sections.map((s) => s.content).join('\n\n---\n\n')
    }

    return JSON.stringify(
      {
        success: true,
        file: result.file,
        content: result.content,
        sections_count: result.sections.length,
        items_count: items.length,
        summary: {
          functions: items.filter((i) => i.type === 'function').length,
          classes: items.filter((i) => i.type === 'class').length,
          interfaces: items.filter((i) => i.type === 'interface').length,
          hooks: items.filter((i) => i.type === 'hook').length,
          types: items.filter((i) => i.type === 'type').length,
        },
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      null,
      2
    )
  }
}

/**
 * Execute generate_single_doc tool.
 */
export const generate_single_doc_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const code = args.code as string
    const itemName = args.item_name as string
    const itemType =
      (args.item_type as 'function' | 'class' | 'interface' | 'type' | 'hook' | 'auto') || 'auto'
    const filePath = (args.file_path as string) || 'unknown'

    // Parse documentation items
    const items = JSDocParser.parseFile(code, filePath)

    // Find the specific item
    let targetItem = items.find((i) => i.name === itemName)

    // If type specified, filter by type
    if (!targetItem && itemType !== 'auto') {
      targetItem = items.find((i) => i.name === itemName && i.type === itemType)
    }

    if (!targetItem) {
      return JSON.stringify(
        {
          success: false,
          error: `Item '${itemName}' not found${itemType !== 'auto' ? ` of type '${itemType}'` : ''}`,
          available_items: items.map((i) => ({ name: i.name, type: i.type })),
        },
        null,
        2
      )
    }

    // Generate documentation
    const doc = generateSingleDoc(targetItem, {
      projectName: 'Project',
      version: '1.0.0',
      includeTOC: false,
      includeFilePaths: true,
    })

    return JSON.stringify(
      {
        success: true,
        item: {
          name: targetItem.name,
          type: targetItem.type,
          file: targetItem.file,
          line: targetItem.line,
        },
        documentation: doc,
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      null,
      2
    )
  }
}

/**
 * Execute extract_docs tool.
 */
export const extract_docs_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const code = args.code as string
    const filterType =
      (args.filter_type as 'function' | 'class' | 'interface' | 'type' | 'hook' | 'all') || 'all'
    const documentedOnly = (args.documented_only as boolean) ?? false
    const filePath = (args.file_path as string) || 'unknown'

    // Parse documentation items
    let items = JSDocParser.parseFile(code, filePath)

    // Filter by type
    if (filterType !== 'all') {
      items = items.filter((i) => i.type === filterType)
    }

    // Filter by documentation presence
    if (documentedOnly) {
      items = items.filter((i) => i.comment !== null)
    }

    return JSON.stringify(
      {
        success: true,
        count: items.length,
        items: items.map((i) => ({
          name: i.name,
          type: i.type,
          file: i.file,
          line: i.line,
          documented: i.comment !== null,
          description: i.comment?.description || null,
          parameters: i.signature?.params || [],
          returns: i.signature?.returnType || null,
        })),
      },
      null,
      2
    )
  } catch (error) {
    return JSON.stringify(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      null,
      2
    )
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Generate Markdown documentation from code.
 */
export async function generateMarkdownDocs(
  code: string,
  options: {
    filePath?: string
    outputFile?: string
    docType?: 'api' | 'readme' | 'skill' | 'all'
    projectName?: string
    version?: string
    includeToc?: boolean
    includeFilePaths?: boolean
  } = {}
): Promise<DocGenerationResult> {
  const items = JSDocParser.parseFile(code, options.filePath || 'unknown')

  return generateDocumentation(items, options.outputFile || 'documentation.md', {
    projectName: options.projectName || 'Project Documentation',
    version: options.version || '1.0.0',
    includeTOC: options.includeToc ?? true,
    includeFilePaths: options.includeFilePaths ?? true,
  })
}

/**
 * Generate documentation for a single item.
 */
export async function generateSingleDocumentation(
  code: string,
  itemName: string,
  options: {
    itemType?: 'function' | 'class' | 'interface' | 'type' | 'hook' | 'auto'
    filePath?: string
  } = {}
): Promise<string | null> {
  const items = JSDocParser.parseFile(code, options.filePath || 'unknown')

  let targetItem = items.find((i) => i.name === itemName)

  if (!targetItem && options.itemType && options.itemType !== 'auto') {
    targetItem = items.find((i) => i.name === itemName && i.type === options.itemType)
  }

  if (!targetItem) {
    return null
  }

  return generateSingleDoc(targetItem)
}

/**
 * Extract all documentation items from code.
 */
export function extractDocumentationItems(code: string, filePath: string = 'unknown'): DocItem[] {
  return JSDocParser.parseFile(code, filePath)
}

// ============================================================================
// Exports
// ============================================================================

export default {
  generate_markdown_docs,
  generate_single_doc,
  extract_docs,
  generate_markdown_docs_executor,
  generate_single_doc_executor,
  extract_docs_executor,
}
