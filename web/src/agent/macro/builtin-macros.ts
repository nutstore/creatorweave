/**
 * Built-in Macros - Predefined macros for common workflows
 *
 * Includes 5+ commonly used operation sequences:
 * 1. refactor-extract - Extract component/function
 * 2. test-generate - Generate unit tests
 * 3. format-imports - Format and organize imports
 * 4. review-code - Code review checklist
 * 5. analyze-performance - Performance analysis
 * 6. doc-generate - Generate documentation
 */

import type { Macro, MacroCategory } from './macro-types'

//=============================================================================
// Built-in Macro Definitions
//=============================================================================

/** Built-in macros registry */
export const BUILTIN_MACROS: Macro[] = [
  // 1. Refactor: Extract Component
  {
    id: 'builtin-refactor-extract',
    name: 'Extract Component',
    description: 'Extract selected code into a reusable component with proper imports',
    triggers: [
      'extract component',
      'create component from selection',
      'make this a component',
      'extract into component',
    ],
    calls: [
      {
        name: 'read',
        arguments: { path: '{sourcePath}' },
        description: 'Read the source file',
      },
      {
        name: 'write',
        arguments: {
          path: '{componentPath}',
          content:
            "import React from 'react'\n\nexport function {componentName}() {\n  return (\n    {selection}\n  )\n}",
        },
        description: 'Create new component file',
      },
      {
        name: 'file_edit',
        arguments: {
          path: '{sourcePath}',
          old_text: '{selection}',
          new_text:
            "import { {componentName} } from './{componentFileName}'\n\n<{componentName} />",
        },
        description: 'Update source file to use new component',
      },
    ],
    parameters: [
      { name: 'sourcePath', label: 'Source File', type: 'string', required: true },
      { name: 'componentPath', label: 'Component Path', type: 'string', required: true },
      { name: 'componentName', label: 'Component Name', type: 'string', required: true },
      { name: 'selection', label: 'Selected Code', type: 'string', required: true },
    ],
    createdAt: Date.now(),
    usageCount: 0,
    category: 'refactoring',
    builtin: true,
  },

  // 2. Test: Generate Unit Tests
  {
    id: 'builtin-test-generate',
    name: 'Generate Unit Tests',
    description: 'Generate comprehensive unit tests for a function or component',
    triggers: [
      'generate tests',
      'create unit tests',
      'add test coverage',
      'write test for',
      'test this function',
    ],
    calls: [
      {
        name: 'read',
        arguments: { path: '{sourcePath}' },
        description: 'Read the source code',
      },
      {
        name: 'write',
        arguments: {
          path: '{testPath}',
          content:
            "import { describe, it, expect } from 'vitest'\nimport { {functionName} } from './{sourceFileName}'\n\ndescribe('{functionName}', () => {\n  it('should work', () => {\n    expect({functionName}()).toBeDefined()\n  })\n\n  // TODO: Add more test cases\n})",
        },
        description: 'Create test file',
      },
    ],
    parameters: [
      { name: 'sourcePath', label: 'Source File', type: 'string', required: true },
      { name: 'testPath', label: 'Test File Path', type: 'string', required: true },
      { name: 'functionName', label: 'Function/Component Name', type: 'string', required: true },
    ],
    createdAt: Date.now(),
    usageCount: 0,
    category: 'testing',
    builtin: true,
  },

  // 3. Format: Organize Imports
  {
    id: 'builtin-format-imports',
    name: 'Organize Imports',
    description: 'Format and organize imports with proper grouping and sorting',
    triggers: [
      'organize imports',
      'format imports',
      'sort imports',
      'clean up imports',
      'fix import order',
    ],
    calls: [
      {
        name: 'read',
        arguments: { path: '{path}' },
        description: 'Read file to format',
      },
      {
        name: 'file_edit',
        arguments: {
          path: '{path}',
          old_text: '{imports}',
          new_text: '{formattedImports}',
        },
        description: 'Replace with formatted imports',
      },
    ],
    parameters: [
      { name: 'path', label: 'File Path', type: 'string', required: true },
      { name: 'imports', label: 'Current Imports', type: 'string', required: true },
      { name: 'formattedImports', label: 'Formatted Imports', type: 'string', required: true },
    ],
    createdAt: Date.now(),
    usageCount: 0,
    category: 'refactoring',
    builtin: true,
  },

  // 4. Review: Code Review Checklist
  {
    id: 'builtin-review-code',
    name: 'Code Review',
    description: 'Run comprehensive code review checklist',
    triggers: [
      'code review',
      'review this code',
      'check code quality',
      'code analysis',
      'review checklist',
    ],
    calls: [
      {
        name: 'read',
        arguments: { path: '{path}' },
        description: 'Read code to review',
      },
    ],
    parameters: [{ name: 'path', label: 'File Path', type: 'string', required: true }],
    createdAt: Date.now(),
    usageCount: 0,
    category: 'analysis',
    builtin: true,
  },

  // 5. Analysis: Performance Check - simplified
  {
    id: 'builtin-analyze-performance',
    name: 'Performance Analysis',
    description: 'Analyze code for performance issues and optimization opportunities',
    triggers: [
      'performance analysis',
      'check performance',
      'analyze performance',
      'performance issues',
      'optimize code',
    ],
    calls: [
      {
        name: 'read',
        arguments: { path: '{path}' },
        description: 'Read code to analyze',
      },
    ],
    parameters: [{ name: 'path', label: 'File Path', type: 'string', required: true }],
    createdAt: Date.now(),
    usageCount: 0,
    category: 'analysis',
    builtin: true,
  },

  // 6. Documentation: Generate Docs
  {
    id: 'builtin-doc-generate',
    name: 'Generate Documentation',
    description: 'Generate documentation for functions, components, or modules',
    triggers: [
      'generate documentation',
      'add docs',
      'document this code',
      'create documentation',
      'write docs',
    ],
    calls: [
      {
        name: 'read',
        arguments: { path: '{path}' },
        description: 'Read code to document',
      },
      {
        name: 'file_edit',
        arguments: {
          path: '{path}',
          old_text: '{codeWithoutDocs}',
          new_text: '{codeWithDocs}',
        },
        description: 'Add documentation to code',
      },
      {
        name: 'write',
        arguments: { path: '{docPath}', content: '{docContent}' },
        description: 'Generate separate documentation file',
      },
    ],
    parameters: [
      { name: 'path', label: 'Source File Path', type: 'string', required: true },
      { name: 'docPath', label: 'Documentation File Path', type: 'string', required: true },
      { name: 'codeWithoutDocs', label: 'Code Without Docs', type: 'string', required: true },
      { name: 'codeWithDocs', label: 'Code With Docs', type: 'string', required: true },
    ],
    createdAt: Date.now(),
    usageCount: 0,
    category: 'documentation',
    builtin: true,
  },
]

//=============================================================================
// Helper Functions
//=============================================================================

/**
 * Get built-in macros by category
 */
export function getBuiltinMacrosByCategory(category: MacroCategory): Macro[] {
  return BUILTIN_MACROS.filter((m) => m.category === category)
}

/**
 * Get all built-in macro trigger phrases
 */
export function getBuiltinTriggers(): string[] {
  return BUILTIN_MACROS.flatMap((m) => m.triggers)
}

/**
 * Find a built-in macro by ID
 */
export function getBuiltinMacro(id: string): Macro | undefined {
  return BUILTIN_MACROS.find((m) => m.id === id)
}

/**
 * Get all built-in macro categories
 */
export function getBuiltinCategories(): MacroCategory[] {
  return [...new Set(BUILTIN_MACROS.map((m) => m.category))]
}
