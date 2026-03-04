/**
 * Code Intelligence Tools
 *
 * Provides symbol extraction, reference finding, and go-to-definition capabilities
 * for various programming languages (TypeScript, JavaScript, Python, etc.).
 *
 * Uses regex-based parsing for simplicity and browser compatibility.
 * For production use with large codebases, consider integrating Tree-sitter or LSP.
 */

import type { ToolDefinition, ToolExecutor } from './tool-types'
import { resolveFileHandle } from '@/services/fsAccess.service'

//=============================================================================
// Types
//=============================================================================

/** Symbol types that can be extracted */
export type SymbolType =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'const'
  | 'let'
  | 'var'
  | 'import'
  | 'export'

/** Parsed symbol information */
export interface CodeSymbol {
  name: string
  type: SymbolType
  kind?: string // More specific kind (e.g., 'method', 'property')
  location: {
    file: string
    line: number
    column: number
  }
  details?: {
    parameters?: string
    returnType?: string
    extends?: string
    implements?: string[]
    value?: string
    source?: string // For imports
    exportedAs?: string // For exports
  }
}

/** Reference type */
export type ReferenceType = 'read' | 'write' | 'call' | 'definition'

/** Code reference location */
export interface CodeReference {
  symbol: string
  file: string
  line: number
  column: number
  type: ReferenceType
  context: string // Surrounding code line
}

/** Language detection */
type Language = 'typescript' | 'javascript' | 'python' | 'unknown'

//=============================================================================
// Language Detection
//=============================================================================

function detectLanguage(filePath: string): Language {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'py':
      return 'python'
    default:
      return 'unknown'
  }
}

//=============================================================================
// Symbol Extraction Patterns
//=============================================================================

/** Regex patterns for different languages and symbol types */
const PATTERNS = {
  // TypeScript/JavaScript patterns
  typescript: {
    // Functions: function name(), const name = () =>, export function name(), etc.
    function: [
      /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm,
      /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*\w+)?\s*=\s*(?:async\s+)?\(/gm,
      /(?:^|\n)\s*(?:export\s+)?(\w+)\s*(?::\s*\w+)?\s*\([^)]*\)\s*(?::\s*\w+)?\s*=>\s*{/gm,
    ],
    // Classes: class Name { ... }
    class: [
      /(?:^|\n)\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/gm,
    ],
    // Interfaces: interface Name { ... }
    interface: [/(?:^|\n)\s*(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([^{]+))?/gm],
    // Type aliases: type Name = ...
    type: [/(?:^|\n)\s*(?:export\s+)?type\s+(\w+)\s*=/gm],
    // Enums: enum Name { ... }
    enum: [/(?:^|\n)\s*(?:export\s+)?enum\s+(\w+)/gm],
    // Variables: const/let/var name = ...
    const: [/(?:^|\n)\s*(?:export\s+)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=/gm],
    let: [/(?:^|\n)\s*(?:export\s+)?let\s+(\w+)\s*(?::\s*[^=]+)?\s*=/gm],
    var: [/(?:^|\n)\s*(?:export\s+)?var\s+(\w+)\s*(?::\s*[^=]+)?\s*=/gm],
    // Imports: import ... from '...'
    import: [
      /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g,
      /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
      /import\s+\(\['"]([^'"]+)['"]\)/g,
    ],
    // Exports: export { name } or export default
    export: [
      /export\s+{([^}]+)}/g,
      /export\s+default\s+/g,
      /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g,
    ],
  },
  // Python patterns
  python: {
    // Functions: def name():
    function: [/(?:^|\n)\s*(?:async\s+)?def\s+(\w+)\s*\(/gm],
    // Classes: class Name:
    class: [/(?:^|\n)\s*class\s+(\w+)(?:\([^)]*\))?:/gm],
    // Variables (module-level): name = ...
    const: [/(?:^|\n)\s*(\w+)\s*=\s*[^=\n]/gm],
    // Imports: import ... from ...
    import: [/import\s+(\w+)/g, /from\s+(\w+)\s+import/g],
    // Exports: __all__ = [...]
    export: [/__all__\s*=\s*\[([^\]]+)\]/g],
  },
}

//=============================================================================
// Tool Definitions
//=============================================================================

export const extractSymbolsDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'extract_symbols',
    description:
      'Extract code symbols (functions, classes, interfaces, types, imports, exports, variables) from a source file. Returns structured information about symbol names, types, locations, and details. Useful for understanding code structure, finding definitions, and analyzing dependencies.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative file path from project root (e.g. "src/utils/helpers.ts")',
        },
        symbol_types: {
          type: 'array',
          description:
            'Optional filter for symbol types to extract. If not provided, extracts all types. Options: function, class, interface, type, enum, const, let, var, import, export',
          items: {
            type: 'string',
          },
        },
      },
      required: ['path'],
    },
  },
}

export const findReferencesDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'find_references',
    description:
      'Find all references to a symbol across multiple files. Searches for symbol usage and returns file paths, line numbers, reference types (read, write, call), and context. Useful for understanding impact of changes, finding where functions are called, or tracking variable usage.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Symbol name to search for (e.g. "myFunction", "MyClass")',
        },
        path: {
          type: 'string',
          description: 'Subdirectory to search in (default: project root)',
        },
        file_pattern: {
          type: 'string',
          description:
            'Only search in files matching this glob pattern (e.g. "*.ts", "src/**/*.tsx")',
        },
        reference_types: {
          type: 'array',
          description:
            'Filter by reference type. Options: "read" (reading value), "write" (assigning value), "call" (function/method call), "definition" (where symbol is defined). If not provided, returns all types.',
          items: {
            type: 'string',
          },
        },
      },
      required: ['symbol'],
    },
  },
}

export const goToDefinitionDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'go_to_definition',
    description:
      'Find where a symbol is defined. Handles local definitions and imported symbols. Follows import chains to locate the original definition. Returns file path, line number, and code snippet. Useful for navigating code, understanding symbol origins, and tracing dependencies.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description:
            'Symbol name to find definition for (e.g. "myFunction", "MyClass", "myVariable")',
        },
        path: {
          type: 'string',
          description: 'File path where the symbol is referenced (e.g. "src/components/App.tsx")',
        },
        line: {
          type: 'number',
          description: 'Line number in the file where the symbol is referenced',
        },
      },
      required: ['symbol', 'path', 'line'],
    },
  },
}

//=============================================================================
// Tool Executors
//=============================================================================

export const extractSymbolsExecutor: ToolExecutor = async (args, context) => {
  const filePath = args.path as string
  const symbolTypes = args.symbol_types as SymbolType[] | undefined

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    // Read file content
    const fileHandle = await resolveFileHandle(context.directoryHandle, filePath)
    const file = await fileHandle.getFile()
    const content = await file.text()

    // Detect language
    const language = detectLanguage(filePath)

    // Extract symbols
    const symbols = extractSymbols(content, filePath, language, symbolTypes)

    return JSON.stringify({
      file: filePath,
      language,
      symbolCount: symbols.length,
      symbols: symbols.slice(0, 500), // Limit to 500 symbols
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return JSON.stringify({ error: `File not found: ${filePath}` })
    }
    return JSON.stringify({
      error: `Failed to extract symbols: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

export const findReferencesExecutor: ToolExecutor = async (args, context) => {
  const symbol = args.symbol as string
  const subPath = (args.path as string) || ''
  const filePattern = args.file_pattern as string | undefined
  const referenceTypes = args.reference_types as ReferenceType[] | undefined

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    const { traverseDirectory } = await import('@/services/traversal.service')
    const micromatch = (await import('micromatch')).default

    // Navigate to subdirectory if specified
    let searchHandle = context.directoryHandle
    if (subPath) {
      const parts = subPath.split('/').filter(Boolean)
      for (const part of parts) {
        searchHandle = await searchHandle.getDirectoryHandle(part)
      }
    }

    const references: CodeReference[] = []
    const MAX_REFERENCES = 200
    let totalRefs = 0

    // Create regex for symbol matching (word boundaries)
    const symbolRegex = new RegExp(`\\b${escapeRegex(symbol)}\\b`, 'g')

    for await (const entry of traverseDirectory(searchHandle)) {
      if (entry.type !== 'file') continue
      if (totalRefs >= MAX_REFERENCES) break

      // Filter by file pattern
      if (filePattern) {
        if (
          !micromatch.isMatch(entry.name, filePattern) &&
          !micromatch.isMatch(entry.path, filePattern)
        ) {
          continue
        }
      }

      // Skip binary files
      const ext = entry.name.split('.').pop()?.toLowerCase()
      const skipExts = new Set([
        'png',
        'jpg',
        'jpeg',
        'gif',
        'ico',
        'svg',
        'woff',
        'woff2',
        'ttf',
        'eot',
        'wasm',
        'zip',
        'gz',
        'tar',
        'pdf',
        'mp3',
        'mp4',
        'webm',
      ])
      if (ext && skipExts.has(ext)) continue

      // Skip large files
      if (entry.size > 512 * 1024) continue

      try {
        const entryPath = subPath ? `${subPath}/${entry.path}` : entry.path
        const fileHandle = await resolveFileHandle(context.directoryHandle!, entryPath)
        const file = await fileHandle.getFile()
        const content = await file.text()

        const lines = content.split('\n')
        const language = detectLanguage(entryPath)

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          symbolRegex.lastIndex = 0

          let match
          while ((match = symbolRegex.exec(line)) !== null) {
            const refType = detectReferenceType(line, match.index, symbol, language)

            // Filter by reference type if specified
            if (referenceTypes && !referenceTypes.includes(refType)) {
              continue
            }

            references.push({
              symbol,
              file: entryPath,
              line: i + 1,
              column: match.index + 1,
              type: refType,
              context: line.trim(),
            })

            totalRefs++
            if (totalRefs >= MAX_REFERENCES) break
          }
          if (totalRefs >= MAX_REFERENCES) break
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return JSON.stringify({
      symbol,
      referenceCount: references.length,
      references: references.slice(0, MAX_REFERENCES),
    })
  } catch (error) {
    return JSON.stringify({
      error: `Failed to find references: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

export const goToDefinitionExecutor: ToolExecutor = async (args, context) => {
  const symbol = args.symbol as string
  const filePath = args.path as string
  const lineNumber = args.line as number

  if (!context.directoryHandle) {
    return JSON.stringify({ error: 'No directory selected. Please select a project folder first.' })
  }

  try {
    // Read the reference file
    const fileHandle = await resolveFileHandle(context.directoryHandle, filePath)
    const file = await fileHandle.getFile()
    const content = await file.text()
    const lines = content.split('\n')

    if (lineNumber < 1 || lineNumber > lines.length) {
      return JSON.stringify({ error: `Invalid line number: ${lineNumber}` })
    }

    const referenceLine = lines[lineNumber - 1]

    // Check if it's an import statement
    const importMatch = referenceLine.match(
      /import\s+(?:(?:{[^}]+}|\w+|\*\s+as\s+\w+)\s+from\s+)?['"]([^'"]+)['"]/
    )

    if (importMatch) {
      // Symbol is imported from another file
      const importPath = importMatch[1]
      const resolvedPath = resolveImportPath(filePath, importPath)

      try {
        // Read the imported file
        const importFileHandle = await resolveFileHandle(context.directoryHandle, resolvedPath)
        const importFile = await importFileHandle.getFile()
        const importContent = await importFile.text()

        // Find the symbol definition
        const definition = findDefinitionInContent(importContent, symbol, resolvedPath)

        if (definition) {
          return JSON.stringify({
            symbol,
            definition: {
              file: resolvedPath,
              line: definition.line,
              column: definition.column,
              snippet: definition.snippet,
            },
          })
        }
      } catch {
        // Import file not found or readable
      }
    }

    // Search in current file for local definition
    const definition = findDefinitionInContent(content, symbol, filePath)

    if (definition) {
      return JSON.stringify({
        symbol,
        definition: {
          file: filePath,
          line: definition.line,
          column: definition.column,
          snippet: definition.snippet,
        },
      })
    }

    return JSON.stringify({
      symbol,
      error: `Definition not found for "${symbol}"`,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return JSON.stringify({ error: `File not found: ${filePath}` })
    }
    return JSON.stringify({
      error: `Failed to go to definition: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Extract symbols from code content
 */
function extractSymbols(
  content: string,
  filePath: string,
  language: Language,
  filterTypes?: SymbolType[]
): CodeSymbol[] {
  const symbols: CodeSymbol[] = []
  const lines = content.split('\n')

  // Get patterns for the language
  const langPatterns = PATTERNS[language as keyof typeof PATTERNS] || PATTERNS.typescript

  // Types to extract
  const typesToExtract = filterTypes || (Object.keys(langPatterns) as SymbolType[])

  for (const type of typesToExtract) {
    const patterns = (langPatterns as Record<SymbolType, RegExp[]>)[type] || []
    if (!patterns) continue

    for (const pattern of patterns) {
      let match
      // Reset regex state
      pattern.lastIndex = 0

      while ((match = pattern.exec(content)) !== null) {
        // Find line number
        const matchContent = content.substring(0, match.index)
        const lineNumber = matchContent.split('\n').length
        const lineContent = lines[lineNumber - 1] || ''

        // Calculate column (1-indexed)
        const column = match.index - matchContent.lastIndexOf('\n')

        const symbol: CodeSymbol = {
          name: match[1],
          type,
          location: {
            file: filePath,
            line: lineNumber,
            column,
          },
        }

        // Add additional details based on symbol type
        if (type === 'function') {
          symbol.kind = 'function'
          symbol.details = {
            parameters: extractParameters(lineContent),
          }
        } else if (type === 'class') {
          symbol.kind = 'class'
          if (match[2]) {
            symbol.details = {
              extends: match[2],
            }
          }
          if (match[3]) {
            symbol.details = {
              ...symbol.details,
              implements: match[3].split(',').map((s: string) => s.trim()),
            }
          }
        } else if (type === 'interface') {
          symbol.kind = 'interface'
          if (match[2]) {
            symbol.details = {
              extends: match[2],
            }
          }
        } else if (type === 'import') {
          symbol.kind = 'import'
          symbol.details = {
            source: match[2] || match[1],
          }
        } else if (type === 'export') {
          symbol.kind = 'export'
          if (match[1]) {
            symbol.details = {
              exportedAs: match[1],
            }
          }
        }

        symbols.push(symbol)
      }
    }
  }

  // Remove duplicates and sort by location
  const uniqueSymbols = symbols.filter(
    (symbol, index, self) =>
      index ===
      self.findIndex((s) => s.name === symbol.name && s.location.line === symbol.location.line)
  )

  return uniqueSymbols.sort((a, b) => a.location.line - b.location.line)
}

/**
 * Extract function parameters from a function declaration line
 */
function extractParameters(line: string): string {
  const match = line.match(/\(([^)]*)\)/)
  return match ? match[1].trim() : ''
}

/**
 * Detect reference type based on context
 */
function detectReferenceType(
  line: string,
  column: number,
  symbol: string,
  _language: Language
): ReferenceType {
  const before = line.substring(0, column).trim()
  const after = line.substring(column + symbol.length).trim()

  // Check for function/method call
  if (after.startsWith('(')) {
    return 'call'
  }

  // Check for assignment (write)
  if (before.endsWith('=') || before.match(/[\s;]let\s+/) || before.match(/[\s;]const\s+/)) {
    return 'write'
  }

  // Check for definition keywords
  if (
    before.match(/function\s+/) ||
    before.match(/class\s+/) ||
    before.match(/interface\s+/) ||
    before.match(/type\s+/) ||
    before.match(/enum\s+/) ||
    before.match(/def\s+/) ||
    before.match(/import\s+/)
  ) {
    return 'definition'
  }

  // Default to read
  return 'read'
}

/**
 * Find symbol definition in content
 */
function findDefinitionInContent(
  content: string,
  symbol: string,
  _filePath: string
): { line: number; column: number; snippet: string } | null {
  const lines = content.split('\n')

  // Try different definition patterns
  const patterns = [
    // Function: function name() / def name() / const name = () =>
    new RegExp(
      `(?:^|\\n)\\s*(?:export\\s+)?(?:async\\s+)?(?:function|def)\\s+${escapeRegex(symbol)}\\s*\\(`,
      'm'
    ),
    new RegExp(
      `(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|var)\\s+${escapeRegex(symbol)}\\s*(?::\\s*\\w+)?\\s*=\\s*(?:async\\s+)?\\(`,
      'm'
    ),
    // Class: class name
    new RegExp(
      `(?:^|\\n)\\s*(?:export\\s+)?(?:abstract\\s+)?class\\s+${escapeRegex(symbol)}\\b`,
      'm'
    ),
    // Interface/Type: interface name / type name
    new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:interface|type)\\s+${escapeRegex(symbol)}\\b`, 'm'),
    // Enum: enum name
    new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?enum\\s+${escapeRegex(symbol)}\\b`, 'm'),
    // Variable: const/let/var name =
    new RegExp(`(?:^|\\n)\\s*(?:export\\s+)?(?:const|let|var)\\s+${escapeRegex(symbol)}\\s*=`, 'm'),
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(content)
    if (match) {
      const matchContent = content.substring(0, match.index)
      // Calculate line number (1-indexed)
      const lineNumber = matchContent.split('\n').length

      // Get snippet (a few lines around)
      const snippetStart = Math.max(0, lineNumber - 2)
      const snippetEnd = Math.min(lines.length, lineNumber + 2)
      const snippet = lines.slice(snippetStart, snippetEnd).join('\n')

      return {
        line: lineNumber,
        column: match.index - matchContent.lastIndexOf('\n') + 1,
        snippet,
      }
    }
  }

  return null
}

/**
 * Resolve import path to actual file path
 */
function resolveImportPath(currentFile: string, importPath: string): string {
  // Handle relative imports
  if (importPath.startsWith('.')) {
    const currentDir = currentFile.substring(0, currentFile.lastIndexOf('/'))
    const parts = currentDir.split('/')
    const importParts = importPath.split('/')

    for (const part of importParts) {
      if (part === '..') {
        parts.pop()
      } else if (part !== '.') {
        parts.push(part)
      }
    }

    // Try to add extension if missing
    let resolved = parts.join('/')
    if (!resolved.includes('.')) {
      resolved += '.ts'
    }

    return resolved
  }

  // For node_modules or absolute imports, return as-is
  // In a real implementation, you'd check package.json exports
  return importPath
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
