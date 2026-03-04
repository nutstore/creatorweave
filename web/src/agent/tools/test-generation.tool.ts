/**
 * Test Generation Tool
 *
 * Analyze code structure and generate Vitest test templates.
 * Supports React components, functions, hooks, and classes.
 *
 * @module test-generation-tool
 */

import type { ToolDefinition, ToolExecutor, ToolContext } from './tool-types'

// ============================================================================
// Type Definitions
// ============================================================================

export interface TestGenerationResult {
  file: string
  testFile: string
  framework: 'vitest' | 'jest' | 'unknown'
  templates: Array<{
    name: string
    type: 'function' | 'component' | 'class' | 'hook'
    body: string
  }>
}

export interface GenerateTestsArgs {
  /** File path to analyze */
  path: string
  /** Source code to analyze */
  code: string
  /** Programming language */
  language?: 'typescript' | 'javascript' | 'tsx' | 'jsx'
  /** Framework to use for tests */
  framework?: 'vitest' | 'jest'
  /** Include snapshot tests for components */
  include_snapshot_tests?: boolean
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Detect exported functions from code
 */
function detectFunctions(
  code: string
): Array<{ name: string; params: string[]; hasReturn: boolean }> {
  const functions: Array<{ name: string; params: string[]; hasReturn: boolean }> = []

  // Arrow functions with const/let
  const arrowFunctionRegex = /(?:const|let|function)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>\s*{?/g
  let match
  while ((match = arrowFunctionRegex.exec(code)) !== null) {
    const funcName = match[1]
    if (!functions.find((f) => f.name === funcName)) {
      functions.push({
        name: funcName,
        params: extractParams(code, match.index),
        hasReturn: hasReturnStatement(code, match.index),
      })
    }
  }

  // Function declarations
  const funcDeclRegex = /function\s+(\w+)\s*\(([^)]*)\)/g
  while ((match = funcDeclRegex.exec(code)) !== null) {
    const funcName = match[1]
    const params = match[2]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    if (!functions.find((f) => f.name === funcName)) {
      functions.push({
        name: funcName,
        params,
        hasReturn: hasReturnStatement(code, match.index),
      })
    }
  }

  // Exported functions
  const exportedArrowRegex = /export\s+(?:const|let)\s+(\w+)\s*=/g
  while ((match = exportedArrowRegex.exec(code)) !== null) {
    const funcName = match[1]
    if (!functions.find((f) => f.name === funcName)) {
      functions.push({
        name: funcName,
        params: extractParams(code, match.index),
        hasReturn: hasReturnStatement(code, match.index),
      })
    }
  }

  return functions
}

/**
 * Extract parameters from function at given position
 */
function extractParams(code: string, position: number): string[] {
  const parenStart = code.indexOf('(', position)
  if (parenStart === -1) return []

  let depth = 1
  let parenEnd = parenStart + 1
  while (parenEnd < code.length && depth > 0) {
    const char = code[parenEnd]
    if (char === '(') depth++
    if (char === ')') depth--
    parenEnd++
  }

  const paramStr = code.slice(parenStart + 1, parenEnd - 1)
  return paramStr
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Check if function has return statement
 */
function hasReturnStatement(code: string, position: number): boolean {
  const funcEnd = code.indexOf('\n', position)
  const funcCode = code.slice(position, funcEnd === -1 ? position + 200 : funcEnd)
  return /\breturn\b/.test(funcCode)
}

/**
 * Detect React components from code
 */
function detectComponents(code: string): Array<{ name: string; propsType: string | null }> {
  const components: Array<{ name: string; propsType: string | null }> = []

  // React functional components
  const componentRegex =
    /(?:export\s+)?(?:const|function)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>\s*(?:jsx|<)/g
  let match
  while ((match = componentRegex.exec(code)) !== null) {
    const name = match[1]
    if (name !== 'React' && !components.find((c) => c.name === name)) {
      components.push({ name, propsType: null })
    }
  }

  // TypeScript component with props type
  const tsxComponentRegex =
    /(?:export\s+)?(?:const|function)\s+(\w+)\s*:\s*React\.FC[^<]*<(\w+Props)>/g
  while ((match = tsxComponentRegex.exec(code)) !== null) {
    const name = match[1]
    const propsType = match[2]
    const existing = components.find((c) => c.name === name)
    if (existing) {
      existing.propsType = propsType
    } else {
      components.push({ name, propsType })
    }
  }

  // JSX/TSX component patterns
  if (/<([A-Z]\w*)\b/.test(code)) {
    const jsxMatch = code.match(/(?:const|function)\s+([A-Z]\w+)\s*[=<]/g)
    if (jsxMatch) {
      jsxMatch.forEach((m) => {
        const name = m.match(/(?:const|function)\s+([A-Z]\w+)/)?.[1]
        if (name && name !== 'React' && !components.find((c) => c.name === name)) {
          components.push({ name, propsType: null })
        }
      })
    }
  }

  return components
}

/**
 * Detect custom hooks from code
 */
function detectHooks(code: string): Array<{ name: string }> {
  const hooks: Array<{ name: string }> = []

  // Hooks start with "use" and are functions
  const hookRegex = /(?:export\s+)?(?:const|function)\s+(use\w+)\s*=/g
  let match
  while ((match = hookRegex.exec(code)) !== null) {
    const name = match[1]
    if (!hooks.find((h) => h.name === name)) {
      hooks.push({ name })
    }
  }

  return hooks
}

/**
 * Detect classes from code
 */
function detectClasses(code: string): Array<{ name: string; methods: string[] }> {
  const classes: Array<{ name: string; methods: string[] }> = []

  // Class declarations
  const classRegex = /(?:export\s+)?class\s+(\w+)/g
  let match
  while ((match = classRegex.exec(code)) !== null) {
    const className = match[1]
    const methods = detectClassMethods(code, match.index)
    classes.push({ name: className, methods })
  }

  return classes
}

/**
 * Detect methods in a class
 */
function detectClassMethods(code: string, classPosition: number): string[] {
  const methods: string[] = []

  // Find class body
  const braceStart = code.indexOf('{', classPosition)
  if (braceStart === -1) return methods

  let depth = 1
  let braceEnd = braceStart + 1
  while (braceEnd < code.length && depth > 0) {
    const char = code[braceEnd]
    if (char === '{') depth++
    if (char === '}') depth--
    braceEnd++
  }

  const classBody = code.slice(braceStart + 1, braceEnd - 1)

  // Match methods (including async, static, private)
  const methodRegex = /(?:(?:public|private|protected|static|async)\s+)*(\w+)\s*\(/g
  let methodMatch
  while ((methodMatch = methodRegex.exec(classBody)) !== null) {
    const methodName = methodMatch[1]
    // Skip constructor and lifecycle methods
    if (
      methodName !== 'constructor' &&
      methodName !== 'connectedCallback' &&
      methodName !== 'disconnectedCallback'
    ) {
      if (!methods.includes(methodName)) {
        methods.push(methodName)
      }
    }
  }

  return methods
}

/**
 * Generate test template for a function
 */
function generateFunctionTest(funcName: string, params: string[], hasReturn: boolean): string {
  if (params.length === 0) {
    return `it('should return expected value', () => {
    const result = ${funcName}()
    expect(result).toBeDefined()
  })`
  }

  const paramAssignments = params.map((p) => `const ${p} = ${inferTestValue(p)}`).join('\n    ')
  const paramArgs = params.join(', ')
  const expectation = hasReturn ? 'expect(result).toBeDefined()' : 'expect(fn).not.toThrow()'

  return `it('should handle ${funcName} with valid input', () => {
    ${paramAssignments}
    const result = ${funcName}(${paramArgs})
    ${expectation}
  })`
}

/**
 * Infer test value based on parameter name
 */
function inferTestValue(paramName: string): string {
  const lower = paramName.toLowerCase()
  if (lower.includes('id') || lower.includes('key')) return "'test-id'"
  if (lower.includes('name')) return "'test-name'"
  if (lower.includes('email')) return "'test@example.com'"
  if (lower.includes('count') || lower.includes('number') || lower.includes('index')) return '1'
  if (lower.includes('list') || lower.includes('array') || lower.includes('items')) return '[]'
  if (lower.includes('obj') || lower.includes('dict') || lower.includes('map')) return '{}'
  if (lower.includes('bool') || lower.includes('flag')) return 'true'
  if (lower.includes('str') || lower.includes('text') || lower.includes('msg')) return "'test'"
  if (lower.includes('fn') || lower.includes('cb') || lower.includes('handler')) return '() => {}'
  return 'null'
}

/**
 * Generate test template for a React component
 */
function generateComponentTest(
  componentName: string,
  propsType: string | null,
  includeSnapshot: boolean
): string[] {
  const tests: string[] = []

  // Basic render test
  tests.push(`it('should render without crashing', () => {
  render(<${componentName} />)
})`)

  // Props test if available
  if (propsType) {
    tests.push(`it('should render with props', () => {
  const mockProps = {}
  render(<${componentName} ${propsType.replace('Props', '')}={mockProps} />)
  expect(screen.getByText(/content/i)).toBeInTheDocument()
})`)
  }

  // Snapshot test
  if (includeSnapshot) {
    tests.push(`it('should match snapshot', () => {
  const { container } = render(<${componentName} />)
  expect(container).toMatchSnapshot()
})`)
  }

  return tests
}

/**
 * Generate test template for a custom hook
 */
function generateHookTest(hookName: string): string {
  return `it('should return expected value', () => {
  const { result } = renderHook(() => ${hookName}())
  expect(result.current).toBeDefined()
})`
}

/**
 * Generate test template for a class
 */
function generateClassTest(className: string, methods: string[]): string {
  if (methods.length === 0) {
    return `it('should create instance', () => {
  const instance = new ${className}()
  expect(instance).toBeDefined()
})`
  }

  const methodTests = methods.slice(0, 3).map((method) => {
    return `it('should call ${method}', () => {
  const instance = new ${className}()
  instance.${method}()
  expect(instance.${method}).toHaveBeenCalled()
})`
  })

  return [
    `it('should create instance', () => {
  const instance = new ${className}()
  expect(instance).toBeDefined()
})`,
    ...methodTests,
  ].join('\n\n  ')
}

/**
 * Detect test framework from package.json
 */
function detectFramework(code: string): 'vitest' | 'jest' | 'unknown' {
  if (/vitest|vi\.describe|vi\.test|test\(/i.test(code)) return 'vitest'
  if (/jest|describe|it\.only|test\.only/i.test(code)) return 'jest'
  return 'vitest' // Default to vitest
}

// ============================================================================
// Tool Definition
// ============================================================================

export const test_generation: ToolDefinition = {
  type: 'function',
  function: {
    name: 'test_generation',
    description:
      'Generate Vitest/Jest test templates for code. Analyzes functions, components, hooks, and classes to create appropriate test cases.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path to generate tests for',
        },
        code: {
          type: 'string',
          description: 'Source code to analyze and generate tests for',
        },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript', 'tsx', 'jsx'],
          description: 'Programming language of the source file',
        },
        framework: {
          type: 'string',
          enum: ['vitest', 'jest'],
          description: 'Test framework to use',
        },
        include_snapshot_tests: {
          type: 'boolean',
          description: 'Include snapshot tests for components',
        },
      },
      required: ['path', 'code'],
    },
  },
}

// ============================================================================
// Tool Executor
// ============================================================================

export const test_generation_executor: ToolExecutor = async (
  args: Record<string, unknown>,
  _context: ToolContext
): Promise<string> => {
  try {
    const file = args.path as string
    const code = args.code as string
    void args.language // Reserved for future language-specific test generation
    const framework = (args.framework as 'vitest' | 'jest') || 'vitest'
    const includeSnapshotTests = (args.include_snapshot_tests as boolean) ?? false

    // Detect test framework (use provided framework if specified, otherwise auto-detect)
    const detectedFramework = framework === 'jest' ? 'jest' : detectFramework(code)

    // Analyze code structure
    const functions = detectFunctions(code)
    const components = detectComponents(code)
    const hooks = detectHooks(code)
    const classes = detectClasses(code)

    // Generate test file path
    const testFile = file.replace(/\.(tsx?|jsx?)$/, '.test$&').replace(/src\//, 'src/__tests__/')

    // Build imports
    const imports: string[] = ["import { describe, it, expect } from 'vitest'"]

    if (components.length > 0) {
      imports.push("import { render, screen } from '@testing-library/react'")
    }

    if (hooks.length > 0) {
      imports.push("import { renderHook } from '@testing-library/react'")
    }

    // Generate test templates
    const templates: Array<{
      name: string
      type: 'function' | 'component' | 'class' | 'hook'
      body: string
    }> = []

    // Function tests
    functions.forEach((func) => {
      templates.push({
        name: func.name,
        type: 'function',
        body: generateFunctionTest(func.name, func.params, func.hasReturn),
      })
    })

    // Component tests
    components.forEach((comp) => {
      const componentTests = generateComponentTest(comp.name, comp.propsType, includeSnapshotTests)
      templates.push({
        name: comp.name,
        type: 'component',
        body: componentTests.join('\n\n  '),
      })
    })

    // Hook tests
    hooks.forEach((hook) => {
      templates.push({
        name: hook.name,
        type: 'hook',
        body: generateHookTest(hook.name),
      })
    })

    // Class tests
    classes.forEach((cls) => {
      templates.push({
        name: cls.name,
        type: 'class',
        body: generateClassTest(cls.name, cls.methods),
      })
    })

    // Build full test file content
    const importSection = imports.join('\n')
    const testSection = templates
      .map((t) => {
        return `describe('${t.name}', () => {
  ${t.body.replace(/\n/g, '\n  ')}
})`
      })
      .join('\n\n')

    const testFileContent = `${importSection}

${testSection}
`

    // Create result
    const result: TestGenerationResult = {
      file,
      testFile,
      framework: detectedFramework,
      templates,
    }

    return JSON.stringify({
      success: true,
      result,
      testFileContent,
      summary: {
        functionsFound: functions.length,
        componentsFound: components.length,
        hooksFound: hooks.length,
        classesFound: classes.length,
        templatesGenerated: templates.length,
      },
      message: `Generated ${templates.length} test templates for ${file}`,
    })
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
