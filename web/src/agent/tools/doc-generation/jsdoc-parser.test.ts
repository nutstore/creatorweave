/**
 * Tests for JSDoc Parser
 */

import { describe, it, expect } from 'vitest'
import { JSDocParser, extractDocumentation, extractDocumentedFunctions } from './jsdoc-parser'

const sampleCode = `
/**
 * This is a sample function with documentation.
 * It demonstrates various JSDoc tags.
 *
 * @param {string} name - The name parameter
 * @param {number} age - The age parameter
 * @returns {string} The greeting message
 * @example
 * greet('John', 25)
 * // Returns: "Hello, John! You are 25 years old."
 */
function greet(name: string, age: number): string {
  return \`Hello, \${name}! You are \${age} years old.\`
}

/**
 * React hook for managing state.
 *
 * @param {any} initialValue - The initial state value
 * @returns {Array} State and setter tuple
 */
function useState<T>(initialValue: T) {
  return [initialValue, () => {}] as const
}

/**
 * Interface for user data.
 */
interface User {
  id: number
  name: string
  email?: string
}

/**
 * Type alias for user response.
 */
type UserResponse = {
  users: User[]
  total: number
}

/**
 * Sample class for demonstration.
 */
class SampleClass {
  /**
   * Constructor with parameters.
   *
   * @param {string} value - The value to store
   */
  constructor(value: string) {}
}

export { greet, useState, User, UserResponse, SampleClass }
`

describe('JSDocParser', () => {
  describe('parseAll', () => {
    it('should parse functions with documentation', () => {
      const items = JSDocParser.parseFile(sampleCode, 'test.ts')

      const functions = items.filter((item) => item.type === 'function')
      expect(functions.length).toBe(1)
      expect(functions[0].name).toBe('greet')
      expect(functions[0].comment).not.toBeNull()
      expect(functions[0].comment?.description).toContain('sample function')
    })

    it('should parse hooks with documentation', () => {
      const items = JSDocParser.parseFile(sampleCode, 'test.ts')

      const hooks = items.filter((item) => item.type === 'hook')
      expect(hooks.length).toBe(1)
      expect(hooks[0].name).toBe('useState')
    })

    it('should parse interfaces', () => {
      const items = JSDocParser.parseFile(sampleCode, 'test.ts')

      const interfaces = items.filter((item) => item.type === 'interface')
      expect(interfaces.length).toBe(1)
      expect(interfaces[0].name).toBe('User')
    })

    it('should parse type aliases', () => {
      const items = JSDocParser.parseFile(sampleCode, 'test.ts')

      const types = items.filter((item) => item.type === 'type')
      expect(types.length).toBe(1)
      expect(types[0].name).toBe('UserResponse')
    })

    it('should parse classes', () => {
      const items = JSDocParser.parseFile(sampleCode, 'test.ts')

      const classes = items.filter((item) => item.type === 'class')
      expect(classes.length).toBe(1)
      expect(classes[0].name).toBe('SampleClass')
    })

    it('should extract @param tags', () => {
      const items = JSDocParser.parseFile(sampleCode, 'test.ts')
      const greetFn = items.find((item) => item.name === 'greet')

      expect(greetFn?.comment).not.toBeNull()
      const paramTags = greetFn?.comment?.tags.filter((tag) => tag.tag === 'param')
      expect(paramTags?.length).toBe(2)
      expect(paramTags?.[0].name).toBe('name')
      expect(paramTags?.[0].type).toBe('string')
      expect(paramTags?.[0].description).toBe('The name parameter')
    })

    it('should extract @returns tag', () => {
      const items = JSDocParser.parseFile(sampleCode, 'test.ts')
      const useStateFn = items.find((item) => item.name === 'useState')

      expect(useStateFn?.comment).not.toBeNull()
      const returnsTag = useStateFn?.comment?.tags.find((tag) => tag.tag === 'returns')
      expect(returnsTag?.type).toBe('Array')
    })

    it('should extract @example tag', () => {
      const items = JSDocParser.parseFile(sampleCode, 'test.ts')
      const greetFn = items.find((item) => item.name === 'greet')

      expect(greetFn?.comment).not.toBeNull()
      const exampleTag = greetFn?.comment?.tags.find((tag) => tag.tag === 'example')
      expect(exampleTag?.description).toBeDefined()
    })

    it('should parse function signatures', () => {
      const items = JSDocParser.parseFile(sampleCode, 'test.ts')
      const greetFn = items.find((item) => item.name === 'greet')

      expect(greetFn?.signature).not.toBeUndefined()
      expect(greetFn?.signature?.params.length).toBe(2)
      expect(greetFn?.signature?.params[0].name).toBe('name')
      expect(greetFn?.signature?.params[0].type).toBe('string')
      expect(greetFn?.signature?.returnType).toBe('string')
    })
  })

  describe('convenience functions', () => {
    it('extractDocumentation should work', () => {
      const items = extractDocumentation(sampleCode, 'test.ts')
      expect(items.length).toBeGreaterThan(0)
    })

    it('extractDocumentedFunctions should only return documented functions', () => {
      const items = extractDocumentedFunctions(sampleCode, 'test.ts')
      // Only greet has JSDoc in this sample
      expect(items.every((item) => item.type === 'function')).toBe(true)
    })
  })
})
