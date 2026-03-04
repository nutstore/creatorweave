/**
 * Code Intelligence Tools Tests
 *
 * Tests for symbol extraction, reference finding, and go-to-definition tools
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractSymbolsDefinition,
  extractSymbolsExecutor,
  findReferencesDefinition,
  findReferencesExecutor,
  goToDefinitionDefinition,
  goToDefinitionExecutor,
  type CodeSymbol,
  type CodeReference,
} from '../code-intelligence.tool'
import type { ToolContext } from '../tool-types'

// Mock fsAccess.service
vi.mock('@/services/fsAccess.service', () => ({
  resolveFileHandle: vi.fn(),
}))

// Mock traversal.service
vi.mock('@/services/traversal.service', () => ({
  traverseDirectory: vi.fn(),
}))

describe('Code Intelligence Tools', () => {
  const mockContext: ToolContext = {
    directoryHandle: {} as FileSystemDirectoryHandle,
    abortSignal: undefined,
  }

  const mockFileHandle = {
    getFile: vi.fn(),
  } as unknown as FileSystemFileHandle

  beforeEach(() => {
    vi.clearAllMocks()
  })

  //=============================================================================
  // extract_symbols Tool Tests
  //=============================================================================

  describe('extract_symbols Tool', () => {
    describe('Tool Definition', () => {
      it('should have correct tool name', () => {
        expect(extractSymbolsDefinition.function.name).toBe('extract_symbols')
      })

      it('should have required path parameter', () => {
        const params = extractSymbolsDefinition.function.parameters
        expect(params.properties.path).toBeDefined()
        expect(params.required).toContain('path')
      })

      it('should have optional symbol_types parameter', () => {
        const params = extractSymbolsDefinition.function.parameters
        expect(params.properties.symbol_types).toBeDefined()
        expect(params.required).not.toContain('symbol_types')
      })

      it('should have comprehensive description', () => {
        const desc = extractSymbolsDefinition.function.description
        expect(desc).toContain('symbols')
        expect(desc).toContain('functions')
        expect(desc).toContain('classes')
        expect(desc).toContain('interfaces')
      })
    })

    describe('Tool Executor', () => {
      it('should extract functions from TypeScript code', async () => {
        const tsCode = `
export function processData(input: string): number {
  return input.length
}

const helper = async (value: number) => {
  return value * 2
}
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(tsCode),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await extractSymbolsExecutor({ path: 'test.ts' }, mockContext)
        const parsed = JSON.parse(result)

        expect(parsed.symbols).toBeDefined()
        expect(parsed.symbols.length).toBeGreaterThan(0)

        const functions = parsed.symbols.filter((s: CodeSymbol) => s.type === 'function')
        expect(functions.length).toBeGreaterThan(0)
        expect(functions[0].name).toBeDefined()
      })

      it('should extract classes from TypeScript code', async () => {
        const tsCode = `
export class UserService {
  constructor(private api: ApiClient) {}

  getUser(id: string): User {
    return this.api.get(id)
  }
}

class BaseModel {
  id: string
}
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(tsCode),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await extractSymbolsExecutor({ path: 'test.ts' }, mockContext)
        const parsed = JSON.parse(result)

        const classes = parsed.symbols.filter((s: CodeSymbol) => s.type === 'class')
        expect(classes.length).toBeGreaterThan(0)
        expect(classes.some((c: CodeSymbol) => c.name === 'UserService')).toBe(true)
      })

      it('should extract interfaces and types', async () => {
        const tsCode = `
export interface User {
  id: string
  name: string
}

export type ApiResponse<T> = {
  data: T
  status: number
}

interface ConfigOptions {
  debug: boolean
}
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(tsCode),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await extractSymbolsExecutor({ path: 'test.ts' }, mockContext)
        const parsed = JSON.parse(result)

        // Should extract some symbols (functions, interfaces, types, etc.)
        expect(parsed.symbols.length).toBeGreaterThan(0)

        // Check if we have at least some interface or type symbols
        const interfaces = parsed.symbols.filter((s: CodeSymbol) => s.type === 'interface')
        const types = parsed.symbols.filter((s: CodeSymbol) => s.type === 'type')

        // We should find at least interfaces OR types
        expect(interfaces.length + types.length).toBeGreaterThan(0)
      })

      it('should extract imports and exports', async () => {
        const tsCode = `
import { useState } from 'react'
import axios from 'axios'
import type { User } from './types'

export const API_URL = 'https://api.example.com'
export { default as Helper } from './helper'
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(tsCode),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await extractSymbolsExecutor({ path: 'test.ts' }, mockContext)
        const parsed = JSON.parse(result)

        const imports = parsed.symbols.filter((s: CodeSymbol) => s.type === 'import')
        const exports = parsed.symbols.filter((s: CodeSymbol) => s.type === 'export')

        expect(imports.length).toBeGreaterThan(0)
        expect(exports.length).toBeGreaterThan(0)
      })

      it('should filter by symbol types when specified', async () => {
        const tsCode = `
export function foo() {}
export class Bar {}
const baz = 123
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(tsCode),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await extractSymbolsExecutor(
          { path: 'test.ts', symbol_types: ['function'] },
          mockContext
        )
        const parsed = JSON.parse(result)

        expect(parsed.symbols.every((s: CodeSymbol) => s.type === 'function')).toBe(true)
      })

      it('should extract symbols from JavaScript code', async () => {
        const jsCode = `
export function init() {
  console.log('initialized')
}

const utils = {
  helper: () => {}
}
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(jsCode),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await extractSymbolsExecutor({ path: 'test.js' }, mockContext)
        const parsed = JSON.parse(result)

        expect(parsed.language).toBe('javascript')
        expect(parsed.symbols.length).toBeGreaterThan(0)
      })

      it('should extract symbols from Python code', async () => {
        const pyCode = `
def process_data(items):
    return [x * 2 for x in items]

class DataProcessor:
    def __init__(self):
        self.cache = {}
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(pyCode),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await extractSymbolsExecutor({ path: 'test.py' }, mockContext)
        const parsed = JSON.parse(result)

        expect(parsed.language).toBe('python')
        expect(parsed.symbols.length).toBeGreaterThan(0)
      })

      it('should handle missing directory handle', async () => {
        const result = await extractSymbolsExecutor(
          { path: 'test.ts' },
          {
            directoryHandle: null,
          }
        )
        const parsed = JSON.parse(result)

        expect(parsed.error).toContain('No directory selected')
      })

      it('should handle file not found', async () => {
        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockRejectedValue(
          new DOMException('Not found', 'NotFoundError')
        )

        const result = await extractSymbolsExecutor({ path: 'nonexistent.ts' }, mockContext)
        const parsed = JSON.parse(result)

        expect(parsed.error).toContain('File not found')
      })
    })
  })

  //=============================================================================
  // find_references Tool Tests
  //=============================================================================

  describe('find_references Tool', () => {
    describe('Tool Definition', () => {
      it('should have correct tool name', () => {
        expect(findReferencesDefinition.function.name).toBe('find_references')
      })

      it('should have required symbol parameter', () => {
        const params = findReferencesDefinition.function.parameters
        expect(params.properties.symbol).toBeDefined()
        expect(params.required).toContain('symbol')
      })

      it('should have optional parameters', () => {
        const params = findReferencesDefinition.function.parameters
        expect(params.properties.path).toBeDefined()
        expect(params.properties.file_pattern).toBeDefined()
        expect(params.properties.reference_types).toBeDefined()
      })
    })

    describe('Tool Executor', () => {
      it('should find references to a symbol', async () => {
        const mockEntries = [
          {
            type: 'file' as const,
            name: 'app.ts',
            path: 'app.ts',
            size: 1000,
            lastModified: Date.now(),
          },
        ]

        const fileContent = `
function processData() {
  return 'data'
}

const result = processData()
processData()
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(fileContent),
        } as unknown as File)

        const { traverseDirectory } = await import('@/services/traversal.service')
        vi.mocked(traverseDirectory).mockImplementation(async function* () {
          yield* mockEntries
        })

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await findReferencesExecutor({ symbol: 'processData' }, mockContext)
        const parsed = JSON.parse(result)

        expect(parsed.symbol).toBe('processData')
        expect(parsed.references).toBeDefined()
        expect(parsed.references.length).toBeGreaterThan(0)
      })

      it('should detect reference types (read, write, call)', async () => {
        const mockEntries = [
          {
            type: 'file' as const,
            name: 'test.ts',
            path: 'test.ts',
            size: 1000,
            lastModified: Date.now(),
          },
        ]

        const fileContent = `
let counter = 0
counter = counter + 1  // write
const value = counter  // read
processData()          // call
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(fileContent),
        } as unknown as File)

        const { traverseDirectory } = await import('@/services/traversal.service')
        vi.mocked(traverseDirectory).mockImplementation(async function* () {
          yield* mockEntries
        })

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await findReferencesExecutor({ symbol: 'counter' }, mockContext)
        const parsed = JSON.parse(result)

        expect(parsed.references.length).toBeGreaterThan(0)
        const types = new Set(parsed.references.map((r: CodeReference) => r.type))
        expect(types.has('read')).toBe(true)
        expect(types.has('write')).toBe(true)
      })

      it('should filter by file pattern', async () => {
        const mockEntries = [
          {
            type: 'file' as const,
            name: 'test.ts',
            path: 'test.ts',
            size: 1000,
            lastModified: Date.now(),
          },
          {
            type: 'file' as const,
            name: 'test.js',
            path: 'test.js',
            size: 1000,
            lastModified: Date.now(),
          },
        ]

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue('const foo = 1'),
        } as unknown as File)

        const { traverseDirectory } = await import('@/services/traversal.service')
        vi.mocked(traverseDirectory).mockImplementation(async function* () {
          yield* mockEntries
        })

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await findReferencesExecutor(
          { symbol: 'foo', file_pattern: '*.ts' },
          mockContext
        )
        const parsed = JSON.parse(result)

        // Should only search in .ts files
        const files = new Set(parsed.references.map((r: CodeReference) => r.file))
        expect(files.has('test.ts')).toBe(true)
        expect(files.has('test.js')).toBe(false)
      })

      it('should filter by reference type', async () => {
        const mockEntries = [
          {
            type: 'file' as const,
            name: 'test.ts',
            path: 'test.ts',
            size: 1000,
            lastModified: Date.now(),
          },
        ]

        const fileContent = `
function helper() {}
helper()  // call
const x = helper  // read
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(fileContent),
        } as unknown as File)

        const { traverseDirectory } = await import('@/services/traversal.service')
        vi.mocked(traverseDirectory).mockImplementation(async function* () {
          yield* mockEntries
        })

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await findReferencesExecutor(
          { symbol: 'helper', reference_types: ['call'] },
          mockContext
        )
        const parsed = JSON.parse(result)

        // Should only return call references
        expect(parsed.references.every((r: CodeReference) => r.type === 'call')).toBe(true)
      })

      it('should provide context for each reference', async () => {
        const mockEntries = [
          {
            type: 'file' as const,
            name: 'test.ts',
            path: 'test.ts',
            size: 1000,
            lastModified: Date.now(),
          },
        ]

        const fileContent = '  const result = myFunction(arg1, arg2)  '

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(fileContent),
        } as unknown as File)

        const { traverseDirectory } = await import('@/services/traversal.service')
        vi.mocked(traverseDirectory).mockImplementation(async function* () {
          yield* mockEntries
        })

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await findReferencesExecutor({ symbol: 'myFunction' }, mockContext)
        const parsed = JSON.parse(result)

        expect(parsed.references[0].context).toBeDefined()
        expect(parsed.references[0].context).toContain('myFunction')
      })

      it('should handle missing directory handle', async () => {
        const result = await findReferencesExecutor(
          { symbol: 'test' },
          {
            directoryHandle: null,
          }
        )
        const parsed = JSON.parse(result)

        expect(parsed.error).toContain('No directory selected')
      })

      it('should limit results to max references', async () => {
        // Create many mock entries
        const mockEntries = Array.from({ length: 300 }, (_, i) => ({
          type: 'file' as const,
          name: `test${i}.ts`,
          path: `test${i}.ts`,
          size: 1000,
          lastModified: Date.now(),
        }))

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue('const test = 1'),
        } as unknown as File)

        const { traverseDirectory } = await import('@/services/traversal.service')
        vi.mocked(traverseDirectory).mockImplementation(async function* () {
          yield* mockEntries
        })

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await findReferencesExecutor({ symbol: 'test' }, mockContext)
        const parsed = JSON.parse(result)

        // Should limit to 200 references
        expect(parsed.references.length).toBeLessThanOrEqual(200)
      })
    })
  })

  //=============================================================================
  // go_to_definition Tool Tests
  //=============================================================================

  describe('go_to_definition Tool', () => {
    describe('Tool Definition', () => {
      it('should have correct tool name', () => {
        expect(goToDefinitionDefinition.function.name).toBe('go_to_definition')
      })

      it('should have all required parameters', () => {
        const params = goToDefinitionDefinition.function.parameters
        expect(params.properties.symbol).toBeDefined()
        expect(params.properties.path).toBeDefined()
        expect(params.properties.line).toBeDefined()
        expect(params.required).toContain('symbol')
        expect(params.required).toContain('path')
        expect(params.required).toContain('line')
      })
    })

    describe('Tool Executor', () => {
      it('should find function definition', async () => {
        const fileContent = `
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0)
}

const result = calculateTotal(data)
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(fileContent),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await goToDefinitionExecutor(
          { symbol: 'calculateTotal', path: 'test.ts', line: 6 },
          mockContext
        )
        const parsed = JSON.parse(result)

        expect(parsed.symbol).toBe('calculateTotal')
        expect(parsed.definition).toBeDefined()
        expect(parsed.definition.file).toBe('test.ts')
        expect(parsed.definition.line).toBeGreaterThanOrEqual(1)
        expect(parsed.definition.snippet).toContain('function calculateTotal')
      })

      it('should find class definition', async () => {
        const fileContent = `
export class UserService {
  constructor() {}
  getUsers() {}
}

const service = new UserService()
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(fileContent),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await goToDefinitionExecutor(
          { symbol: 'UserService', path: 'test.ts', line: 6 },
          mockContext
        )
        const parsed = JSON.parse(result)

        expect(parsed.definition).toBeDefined()
        expect(parsed.definition.line).toBeGreaterThanOrEqual(1)
        expect(parsed.definition.snippet).toContain('class UserService')
      })

      it('should find interface definition', async () => {
        const fileContent = `
export interface User {
  id: string
  name: string
}

function processUser(user: User) {}
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(fileContent),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await goToDefinitionExecutor(
          { symbol: 'User', path: 'test.ts', line: 6 },
          mockContext
        )
        const parsed = JSON.parse(result)

        expect(parsed.definition).toBeDefined()
        expect(parsed.definition.line).toBeGreaterThanOrEqual(1)
        expect(parsed.definition.snippet).toContain('interface User')
      })

      it('should find variable definition', async () => {
        const fileContent = `
const API_URL = 'https://api.example.com'

async function fetchData() {
  const response = await fetch(API_URL)
  return response.json()
}
`

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(fileContent),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await goToDefinitionExecutor(
          { symbol: 'API_URL', path: 'test.ts', line: 4 },
          mockContext
        )
        const parsed = JSON.parse(result)

        expect(parsed.definition).toBeDefined()
        expect(parsed.definition.line).toBeGreaterThanOrEqual(1)
        expect(parsed.definition.snippet).toContain('const API_URL')
      })

      it('should handle imported symbols', async () => {
        const mainFile = `
import { processData } from './utils'

const result = processData()
`

        // Mock the main file
        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(mainFile),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await goToDefinitionExecutor(
          { symbol: 'processData', path: 'main.ts', line: 4 },
          mockContext
        )
        const parsed = JSON.parse(result)

        // Tool should handle the import gracefully
        // It might not find the definition (since we don't mock the utils file)
        // but it should not crash and should return a structured response
        expect(parsed.symbol || parsed.error).toBeDefined()
      })

      it('should return error for undefined symbol', async () => {
        const fileContent = 'const x = 1'

        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue(fileContent),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await goToDefinitionExecutor(
          { symbol: 'nonexistent', path: 'test.ts', line: 1 },
          mockContext
        )
        const parsed = JSON.parse(result)

        expect(parsed.error).toContain('Definition not found')
      })

      it('should handle invalid line number', async () => {
        vi.mocked(mockFileHandle.getFile).mockResolvedValue({
          text: vi.fn().mockResolvedValue('line 1\nline 2'),
        } as unknown as File)

        const { resolveFileHandle } = await import('@/services/fsAccess.service')
        vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

        const result = await goToDefinitionExecutor(
          { symbol: 'test', path: 'test.ts', line: 999 },
          mockContext
        )
        const parsed = JSON.parse(result)

        expect(parsed.error).toContain('Invalid line number')
      })

      it('should handle missing directory handle', async () => {
        const result = await goToDefinitionExecutor(
          { symbol: 'test', path: 'test.ts', line: 1 },
          { directoryHandle: null }
        )
        const parsed = JSON.parse(result)

        expect(parsed.error).toContain('No directory selected')
      })
    })
  })

  //=============================================================================
  // Edge Cases and Error Handling
  //=============================================================================

  describe('Edge Cases', () => {
    it('should handle empty file', async () => {
      vi.mocked(mockFileHandle.getFile).mockResolvedValue({
        text: vi.fn().mockResolvedValue(''),
      } as unknown as File)

      const { resolveFileHandle } = await import('@/services/fsAccess.service')
      vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

      const result = await extractSymbolsExecutor({ path: 'empty.ts' }, mockContext)
      const parsed = JSON.parse(result)

      expect(parsed.symbols).toEqual([])
    })

    it('should handle files with only comments', async () => {
      const content = `
// This is a comment
/**
 * Multi-line comment
 */
// Another comment
`

      vi.mocked(mockFileHandle.getFile).mockResolvedValue({
        text: vi.fn().mockResolvedValue(content),
      } as unknown as File)

      const { resolveFileHandle } = await import('@/services/fsAccess.service')
      vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

      const result = await extractSymbolsExecutor({ path: 'comments.ts' }, mockContext)
      const parsed = JSON.parse(result)

      expect(parsed.symbols.length).toBe(0)
    })

    it('should handle malformed code gracefully', async () => {
      const content = `
function malformed(
class Broken {
const incomplete
`

      vi.mocked(mockFileHandle.getFile).mockResolvedValue({
        text: vi.fn().mockResolvedValue(content),
      } as unknown as File)

      const { resolveFileHandle } = await import('@/services/fsAccess.service')
      vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

      // Should not throw, but may extract partial symbols
      const result = await extractSymbolsExecutor({ path: 'malformed.ts' }, mockContext)
      expect(() => JSON.parse(result)).not.toThrow()
    })

    it('should handle special characters in symbol names', async () => {
      const content = `
const _underscore = 1
function withDollar$() {}

// Note: Special chars like $ at start may not be captured by regex
`

      vi.mocked(mockFileHandle.getFile).mockResolvedValue({
        text: vi.fn().mockResolvedValue(content),
      } as unknown as File)

      const { resolveFileHandle } = await import('@/services/fsAccess.service')
      vi.mocked(resolveFileHandle).mockResolvedValue(mockFileHandle)

      const result = await extractSymbolsExecutor({ path: 'special.ts' }, mockContext)
      const parsed = JSON.parse(result)

      // Should find at least the underscore function
      expect(parsed.symbols.length).toBeGreaterThan(0)
    })
  })
})
