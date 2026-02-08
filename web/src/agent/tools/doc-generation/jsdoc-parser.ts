/**
 * JSDoc/TSDoc Parser
 * Parses JSDoc comments from source code and extracts structured documentation.
 */

/** Represents a parsed JSDoc/TSDoc comment */
export interface DocComment {
  description: string
  tags: Array<{
    tag: string
    name?: string
    type?: string
    description?: string
  }>
  location: {
    start: number
    end: number
  }
}

/** Represents a documented code item */
export interface DocItem {
  name: string
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'hook'
  file: string
  line: number
  comment: DocComment | null
  signature?: {
    params: Array<{ name: string; type: string; optional: boolean }>
    returnType?: string
  }
}

/** Parsed JSDoc tag content */
interface ParsedTag {
  tag: string
  name?: string
  type?: string
  description?: string
}

/**
 * JSDoc Parser for extracting documentation from TypeScript/JavaScript files.
 */
export class JSDocParser {
  private fileContent: string
  private filePath: string

  constructor(content: string, filePath: string = 'unknown') {
    this.fileContent = content
    this.filePath = filePath
  }

  /**
   * Parse all documentation items from the file.
   */
  parseAll(): DocItem[] {
    const items: DocItem[] = []

    // Parse functions
    items.push(...this.parseFunctions())

    // Parse classes
    items.push(...this.parseClasses())

    // Parse interfaces
    items.push(...this.parseInterfaces())

    // Parse type aliases
    items.push(...this.parseTypeAliases())

    // Parse variables/const
    items.push(...this.parseVariables())

    // Parse React hooks
    items.push(...this.parseHooks())

    return items.sort((a, b) => a.line - b.line)
  }

  /**
   * Parse function documentation.
   */
  private parseFunctions(): DocItem[] {
    const items: DocItem[] = []

    // Match function declarations: function name(...): returnType - handles generics like <T>
    const functionRegex =
      /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)(?:<[^>]*>)?\s*\(([^)]*)\)\s*(?::\s*([^{]+))?\{?/g

    let match
    while ((match = functionRegex.exec(this.fileContent)) !== null) {
      const name = match[1]
      const paramsStr = match[2] || ''
      const returnType = match[3]?.trim()

      // Skip React hooks (they start with use)
      if (name.startsWith('use')) {
        continue
      }

      const beforeMatch = this.fileContent.substring(0, match.index)
      const line = this.countLines(beforeMatch)

      const comment = this.findPrecedingComment(match.index)

      items.push({
        name,
        type: 'function',
        file: this.filePath,
        line,
        comment,
        signature: {
          params: this.parseParams(paramsStr),
          returnType: returnType?.replace(/\s*\{/g, '').trim(),
        },
      })
    }

    // Match arrow functions: const/let name = (...): returnType =>
    const arrowFunctionRegex =
      /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*([^{]+))?\s*=>/g

    while ((match = arrowFunctionRegex.exec(this.fileContent)) !== null) {
      const name = match[1]
      const paramsStr = match[2] || ''
      const returnType = match[3]?.trim()

      // Skip React hooks (they start with use)
      if (name.startsWith('use')) {
        continue
      }

      const beforeMatch = this.fileContent.substring(0, match.index)
      const line = this.countLines(beforeMatch)

      const comment = this.findPrecedingComment(match.index)

      items.push({
        name,
        type: 'function',
        file: this.filePath,
        line,
        comment,
        signature: {
          params: this.parseParams(paramsStr),
          returnType: returnType?.replace(/\s*\{/g, '').trim(),
        },
      })
    }

    return items
  }

  /**
   * Parse class documentation.
   */
  private parseClasses(): DocItem[] {
    const items: DocItem[] = []

    // Match class declarations
    const classRegex =
      /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:extends\s+([^{]+))?\s*(?:implements\s+([^{]+))?\{/g

    let match
    while ((match = classRegex.exec(this.fileContent)) !== null) {
      const name = match[1]
      const beforeMatch = this.fileContent.substring(0, match.index)
      const line = this.countLines(beforeMatch)

      const comment = this.findPrecedingComment(match.index)

      items.push({
        name,
        type: 'class',
        file: this.filePath,
        line,
        comment,
      })
    }

    return items
  }

  /**
   * Parse interface documentation.
   */
  private parseInterfaces(): DocItem[] {
    const items: DocItem[] = []

    // Match interface declarations
    const interfaceRegex = /interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:extends\s+([^{]+))?\{/g

    let match
    while ((match = interfaceRegex.exec(this.fileContent)) !== null) {
      const name = match[1]
      const beforeMatch = this.fileContent.substring(0, match.index)
      const line = this.countLines(beforeMatch)

      const comment = this.findPrecedingComment(match.index)

      items.push({
        name,
        type: 'interface',
        file: this.filePath,
        line,
        comment,
      })
    }

    return items
  }

  /**
   * Parse type alias documentation.
   */
  private parseTypeAliases(): DocItem[] {
    const items: DocItem[] = []

    // Match type alias declarations
    const typeRegex =
      /type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[=]\s*(?:type|interface|{|(?:async\s*)?\()/g

    let match
    while ((match = typeRegex.exec(this.fileContent)) !== null) {
      const name = match[1]
      const beforeMatch = this.fileContent.substring(0, match.index)
      const line = this.countLines(beforeMatch)

      const comment = this.findPrecedingComment(match.index)

      items.push({
        name,
        type: 'type',
        file: this.filePath,
        line,
        comment,
      })
    }

    return items
  }

  /**
   * Parse variable/constant documentation.
   */
  private parseVariables(): DocItem[] {
    const items: DocItem[] = []

    // Match const/let/var declarations with type annotations
    const variableRegex =
      /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[:]\s*([^{;=]+?)(?:\s*[=]|$)/g

    let match
    while ((match = variableRegex.exec(this.fileContent)) !== null) {
      const name = match[1]
      const type = match[2]?.trim()

      // Skip if it's clearly a function or type alias
      if (
        type &&
        (type.includes('=>') || type.startsWith('interface') || type.startsWith('type'))
      ) {
        continue
      }

      const beforeMatch = this.fileContent.substring(0, match.index)
      const line = this.countLines(beforeMatch)

      const comment = this.findPrecedingComment(match.index)

      items.push({
        name,
        type: 'variable',
        file: this.filePath,
        line,
        comment,
        signature: type
          ? {
              params: [],
              returnType: type,
            }
          : undefined,
      })
    }

    return items
  }

  /**
   * Parse React hook documentation (use* pattern).
   */
  private parseHooks(): DocItem[] {
    const items: DocItem[] = []

    // Match React hooks: function use* - handles generics like useState<T>
    const hookFunctionRegex = /function\s+(use[a-zA-Z0-9_$]*)(?:<[^>]*>)?\s*\(([^)]*)\)/g

    let match
    while ((match = hookFunctionRegex.exec(this.fileContent)) !== null) {
      const name = match[1]
      const paramsStr = match[2] || ''

      const beforeMatch = this.fileContent.substring(0, match.index)
      const line = this.countLines(beforeMatch)

      const comment = this.findPrecedingComment(match.index)

      items.push({
        name,
        type: 'hook',
        file: this.filePath,
        line,
        comment,
        signature: {
          params: this.parseParams(paramsStr),
          returnType: 'any',
        },
      })
    }

    // Match React hooks: const/let use* = () => {
    const hookConstRegex = /(?:const|let|var)\s+(use[a-zA-Z0-9_$]*)\s*[=]\s*(?:async\s*)?\(\)\s*=>/g

    while ((match = hookConstRegex.exec(this.fileContent)) !== null) {
      const name = match[1]

      const beforeMatch = this.fileContent.substring(0, match.index)
      const line = this.countLines(beforeMatch)

      const comment = this.findPrecedingComment(match.index)

      items.push({
        name,
        type: 'hook',
        file: this.filePath,
        line,
        comment,
        signature: {
          params: [],
          returnType: 'any',
        },
      })
    }

    return items
  }

  /**
   * Find JSDoc comment preceding a code element.
   */
  private findPrecedingComment(position: number): DocComment | null {
    // Look backwards for /** ... */
    const beforeContent = this.fileContent.substring(0, position)

    // Find ALL JSDoc comments in the preceding content and take the last one
    // that is immediately followed by the code element
    const jsdocRegex = /\/\*\*[\s\S]*?\*\//g
    const matches: RegExpExecArray[] = []
    let match

    while ((match = jsdocRegex.exec(beforeContent)) !== null) {
      matches.push(match)
    }

    if (matches.length === 0) {
      return null
    }

    // Take the last JSDoc match
    const lastMatch = matches[matches.length - 1]
    const commentText = lastMatch[0]
    const commentStart = lastMatch.index

    // Verify the comment is immediately before the code element
    // (only whitespace and single-line comments between comment and code)
    const afterComment = beforeContent.substring(commentStart + commentText.length)
    const codeStart = afterComment.match(/^\s*(?:\/\/[^\n]*\n)*\s*/)

    if (codeStart && codeStart[0].length > 500) {
      // Too much whitespace/comments between - not a direct predecessor
      // Try the previous match instead
      if (matches.length >= 2) {
        const prevMatch = matches[matches.length - 2]
        return this.parseJSDocContent(prevMatch[0], prevMatch.index)
      }
      return null
    }

    return this.parseJSDocContent(commentText, commentStart)
  }

  /**
   * Parse JSDoc comment text into DocComment structure.
   */
  private parseJSDocContent(commentText: string, commentStart: number): DocComment {
    // Parse the comment content
    const content = commentText
      .replace(/^\/\*\*\s*/, '') // Remove /**
      .replace(/\s*\*\/$/, '') // Remove */ at the end
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, ''))
      .join('\n')
      .trim()

    // Split description and tags
    const lines = content.split('\n')
    let description = ''
    const tags: ParsedTag[] = []
    let inExample = false
    let exampleLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmedLine = line.trim()

      // Check for @example start (may span multiple lines)
      if (trimmedLine.startsWith('@example')) {
        inExample = true
        exampleLines = [trimmedLine.replace('@example', '').trim()]
        continue
      }

      // Check for other @tags
      // Match patterns like:
      // @param {type} name - description
      // @param name - description
      // @returns {type} description
      // @returns description
      // @example description
      const tagMatch = trimmedLine.match(/^@(\w+)(?:\s*\{([^}]*)\})?(?:\s+(\S+))?(?:\s+(.*))?$/s)

      if (tagMatch) {
        // If we were in an example, push it (even if empty)
        if (inExample) {
          tags.push({
            tag: 'example',
            description: exampleLines.join('\n'),
          })
          exampleLines = []
          inExample = false
        }

        const tagName = tagMatch[1]
        const typeContent = tagMatch[2]
        const nameOrFirst = tagMatch[3]
        let restDescription = tagMatch[4]?.trim() || ''

        // Clean up description - remove leading dash/colon if present
        restDescription = restDescription.replace(/^[-:]\s*/, '')

        if (tagName === 'param' && typeContent) {
          // @param {type} name - description
          tags.push({
            tag: 'param',
            type: typeContent,
            name: nameOrFirst || '',
            description: restDescription,
          })
        } else if (tagName === 'param' && !typeContent && nameOrFirst) {
          // @param name - description (without type)
          tags.push({
            tag: 'param',
            name: nameOrFirst,
            description: restDescription,
          })
        } else if ((tagName === 'returns' || tagName === 'return') && typeContent) {
          // @returns {type} description - description includes nameOrFirst + restDescription
          const fullDescription = nameOrFirst
            ? nameOrFirst + (restDescription ? ' ' + restDescription : '')
            : restDescription
          tags.push({
            tag: 'returns',
            type: typeContent,
            description: fullDescription,
          })
        } else if ((tagName === 'returns' || tagName === 'return') && nameOrFirst) {
          // @returns description (without type)
          tags.push({
            tag: 'returns',
            description: nameOrFirst + (restDescription ? ' ' + restDescription : ''),
          })
        } else if (tagName === 'example') {
          // @example - everything after @example is the example content
          const exampleContent = typeContent || nameOrFirst || ''
          exampleLines.push(exampleContent + (restDescription ? ' ' + restDescription : ''))
        } else {
          tags.push({
            tag: tagName,
            name: typeContent,
            description: restDescription || nameOrFirst,
          })
        }
      } else if (inExample) {
        // Continue collecting example content (include empty lines in example)
        exampleLines.push(line)
      } else if (trimmedLine && !trimmedLine.startsWith('@') && !trimmedLine.startsWith('-')) {
        // Part of description
        description += (description ? '\n' : '') + trimmedLine.replace(/^[-:]\s*/, '').trim()
      }
    }

    // Handle any remaining example content
    if (inExample) {
      tags.push({
        tag: 'example',
        description: exampleLines.join('\n'),
      })
    }

    return {
      description,
      tags,
      location: {
        start: commentStart,
        end: commentStart + commentText.length,
      },
    }
  }

  /**
   * Parse parameter list string into structured format.
   */
  private parseParams(paramsStr: string): Array<{ name: string; type: string; optional: boolean }> {
    if (!paramsStr.trim()) {
      return []
    }

    const params: Array<{ name: string; type: string; optional: boolean }> = []
    let currentParam = ''
    let braceDepth = 0

    for (const char of paramsStr) {
      if (char === '{' || char === '<') {
        braceDepth++
        currentParam += char
      } else if (char === '}' || char === '>') {
        braceDepth--
        currentParam += char
      } else if (char === ',' && braceDepth === 0) {
        if (currentParam.trim()) {
          const parsed = this.parseSingleParam(currentParam)
          if (parsed) {
            params.push(parsed)
          }
        }
        currentParam = ''
      } else {
        currentParam += char
      }
    }

    if (currentParam.trim()) {
      const parsed = this.parseSingleParam(currentParam)
      if (parsed) {
        params.push(parsed)
      }
    }

    return params
  }

  /**
   * Parse a single parameter string.
   */
  private parseSingleParam(
    paramStr: string
  ): { name: string; type: string; optional: boolean } | null {
    paramStr = paramStr.trim()

    if (!paramStr) {
      return null
    }

    // Handle destructuring: { name, type } or { name: type }
    if (paramStr.startsWith('{')) {
      return {
        name: paramStr,
        type: 'object',
        optional: paramStr.includes('?'),
      }
    }

    // Handle spread: ...args or ...params
    if (paramStr.startsWith('...')) {
      const name = paramStr.slice(3).split(/[:?]/)[0].trim()
      const type = paramStr.split(/[:?]/)[1]?.trim() || 'any[]'
      return { name, type, optional: false }
    }

    // Handle regular params: name: type or name?: type
    const parts = paramStr.split(/[:?]/)
    const name = parts[0].trim()
    const type = parts[1]?.trim() || 'unknown'
    const optional = paramStr.includes('?')

    return { name, type, optional }
  }

  /**
   * Count lines up to a position.
   */
  private countLines(text: string): number {
    return (text.match(/\n/g) || []).length + 1
  }

  /**
   * Parse a single file and return all documentation items.
   */
  static parseFile(content: string, filePath: string = 'unknown'): DocItem[] {
    const parser = new JSDocParser(content, filePath)
    return parser.parseAll()
  }

  /**
   * Parse multiple files and return all documentation items.
   */
  static parseFiles(files: Array<{ content: string; path: string }>): DocItem[] {
    const allItems: DocItem[] = []

    for (const file of files) {
      const items = this.parseFile(file.content, file.path)
      allItems.push(...items)
    }

    return allItems.sort((a, b) => {
      // Sort by file first, then by line
      if (a.file !== b.file) {
        return a.file.localeCompare(b.file)
      }
      return a.line - b.line
    })
  }
}

/**
 * Convenience function to extract documentation from source code.
 */
export function extractDocumentation(content: string, filePath: string = 'unknown'): DocItem[] {
  return JSDocParser.parseFile(content, filePath)
}

/**
 * Extract only functions with documentation.
 */
export function extractDocumentedFunctions(
  content: string,
  filePath: string = 'unknown'
): DocItem[] {
  return JSDocParser.parseFile(content, filePath).filter(
    (item) => item.type === 'function' && item.comment !== null
  )
}

/**
 * Extract React hooks with documentation.
 */
export function extractDocumentedHooks(content: string, filePath: string = 'unknown'): DocItem[] {
  return JSDocParser.parseFile(content, filePath).filter(
    (item) => item.type === 'hook' && item.comment !== null
  )
}
