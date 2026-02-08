/**
 * Tool Registry
 *
 * Central registry for all agent tools with user persona mapping.
 * Organizes tools by target user: developers, data analysts, students, office workers.
 *
 * @module tool-registry
 */

import { ToolDefinition, ToolExecutor, ToolEntry } from './tool-types'

// Import new tools
import {
  t_test,
  t_test_executor,
  chi_square,
  chi_square_executor,
  correlation,
  correlation_executor,
  anova,
  anova_executor,
} from './statistical-tests.tool'

import {
  explain,
  explain_executor,
  create_learning_plan,
  create_learning_plan_executor,
  solve_step_by_step,
  solve_step_by_step_executor,
} from './learning-mode.tool'

import {
  read_excel,
  read_excel_executor,
  analyze_excel,
  analyze_excel_executor,
  export_to_csv,
  export_to_csv_executor,
  query_excel,
  query_excel_executor,
} from './excel-integration.tool'

import {
  generate_chart,
  generate_chart_executor,
  export_visualization,
  export_visualization_executor,
  data_summary,
  data_summary_executor,
} from './data-visualization.tool'

import {
  analyze_code,
  analyze_code_executor,
  find_patterns,
  find_patterns_executor,
  refactor_suggestions,
  refactor_suggestions_executor,
} from './code-analysis.tool'

import {
  convert_format,
  convert_format_executor,
  aggregate_data,
  aggregate_data_executor,
  transform_data,
  transform_data_executor,
} from './utility-tools.tool'

// ============================================================================
// User Persona Types
// ============================================================================

export type UserPersona = 'developer' | 'data-analyst' | 'student' | 'office-worker' | 'general'

export interface ToolMetadata {
  name: string
  description: string
  personas: UserPersona[]
  category: string
  tags: string[]
  complexity: 'beginner' | 'intermediate' | 'advanced'
}

// ============================================================================
// New Tool Registry (Phase 5)
// ============================================================================

/**
 * New tool definitions and executors organized by category
 */
export const NEW_TOOL_REGISTRY: Record<
  string,
  {
    definition: ToolDefinition
    executor: ToolExecutor
    metadata: ToolMetadata
  }
> = {
  // ==================== Statistical Tests ====================
  t_test: {
    definition: t_test,
    executor: t_test_executor,
    metadata: {
      name: 't_test',
      description: 'Perform t-test analysis to compare means',
      personas: ['data-analyst', 'student'],
      category: 'statistical-tests',
      tags: ['statistics', 't-test', 'hypothesis'],
      complexity: 'intermediate',
    },
  },
  chi_square: {
    definition: chi_square,
    executor: chi_square_executor,
    metadata: {
      name: 'chi_square',
      description: 'Chi-square test of independence',
      personas: ['data-analyst', 'student'],
      category: 'statistical-tests',
      tags: ['statistics', 'chi-square', 'categorical'],
      complexity: 'intermediate',
    },
  },
  correlation: {
    definition: correlation,
    executor: correlation_executor,
    metadata: {
      name: 'correlation',
      description: 'Calculate correlation between variables',
      personas: ['data-analyst', 'student'],
      category: 'statistical-tests',
      tags: ['statistics', 'correlation', 'relationship'],
      complexity: 'beginner',
    },
  },
  anova: {
    definition: anova,
    executor: anova_executor,
    metadata: {
      name: 'anova',
      description: 'One-way ANOVA for comparing group means',
      personas: ['data-analyst', 'student'],
      category: 'statistical-tests',
      tags: ['statistics', 'anova', 'groups'],
      complexity: 'intermediate',
    },
  },

  // ==================== Learning Mode ====================
  explain: {
    definition: explain,
    executor: explain_executor,
    metadata: {
      name: 'explain',
      description: 'Get step-by-step explanations of programming concepts',
      personas: ['student', 'developer'],
      category: 'learning',
      tags: ['learning', 'explanation', 'education'],
      complexity: 'beginner',
    },
  },
  create_learning_plan: {
    definition: create_learning_plan,
    executor: create_learning_plan_executor,
    metadata: {
      name: 'create_learning_plan',
      description: 'Create a structured learning plan for a topic',
      personas: ['student'],
      category: 'learning',
      tags: ['learning', 'plan', 'curriculum'],
      complexity: 'beginner',
    },
  },
  solve_step_by_step: {
    definition: solve_step_by_step,
    executor: solve_step_by_step_executor,
    metadata: {
      name: 'solve_step_by_step',
      description: 'Get step-by-step guidance to solve problems',
      personas: ['student', 'developer'],
      category: 'learning',
      tags: ['learning', 'problem-solving', 'guidance'],
      complexity: 'beginner',
    },
  },

  // ==================== Excel Integration ====================
  read_excel: {
    definition: read_excel,
    executor: read_excel_executor,
    metadata: {
      name: 'read_excel',
      description: 'Read and parse Excel files (XLSX, CSV, JSON)',
      personas: ['office-worker', 'data-analyst'],
      category: 'excel',
      tags: ['excel', 'spreadsheet', 'csv'],
      complexity: 'beginner',
    },
  },
  analyze_excel: {
    definition: analyze_excel,
    executor: analyze_excel_executor,
    metadata: {
      name: 'analyze_excel',
      description: 'Analyze Excel file structure and content',
      personas: ['office-worker', 'data-analyst'],
      category: 'excel',
      tags: ['excel', 'analysis', 'statistics'],
      complexity: 'beginner',
    },
  },
  export_to_csv: {
    definition: export_to_csv,
    executor: export_to_csv_executor,
    metadata: {
      name: 'export_to_csv',
      description: 'Convert Excel data to CSV format',
      personas: ['office-worker', 'data-analyst'],
      category: 'excel',
      tags: ['excel', 'csv', 'export'],
      complexity: 'beginner',
    },
  },
  query_excel: {
    definition: query_excel,
    executor: query_excel_executor,
    metadata: {
      name: 'query_excel',
      description: 'Query Excel data using filters',
      personas: ['office-worker', 'data-analyst'],
      category: 'excel',
      tags: ['excel', 'query', 'filter'],
      complexity: 'intermediate',
    },
  },

  // ==================== Data Visualization ====================
  generate_chart: {
    definition: generate_chart,
    executor: generate_chart_executor,
    metadata: {
      name: 'generate_chart',
      description: 'Generate charts (bar, line, pie, scatter, histogram) from data',
      personas: ['data-analyst', 'student', 'office-worker'],
      category: 'visualization',
      tags: ['chart', 'visualization', 'graph'],
      complexity: 'beginner',
    },
  },
  export_visualization: {
    definition: export_visualization,
    executor: export_visualization_executor,
    metadata: {
      name: 'export_visualization',
      description: 'Export visualizations as PNG, SVG, or data as CSV',
      personas: ['data-analyst', 'office-worker'],
      category: 'visualization',
      tags: ['export', 'visualization', 'download'],
      complexity: 'beginner',
    },
  },
  data_summary: {
    definition: data_summary,
    executor: data_summary_executor,
    metadata: {
      name: 'data_summary',
      description: 'Generate data summary with statistics and distributions',
      personas: ['data-analyst', 'student'],
      category: 'visualization',
      tags: ['statistics', 'summary', 'distribution'],
      complexity: 'beginner',
    },
  },

  // ==================== Code Analysis ====================
  analyze_code: {
    definition: analyze_code,
    executor: analyze_code_executor,
    metadata: {
      name: 'analyze_code',
      description: 'Analyze code complexity, quality, and security issues',
      personas: ['developer'],
      category: 'code-analysis',
      tags: ['analysis', 'complexity', 'security', 'code-quality'],
      complexity: 'intermediate',
    },
  },
  find_patterns: {
    definition: find_patterns,
    executor: find_patterns_executor,
    metadata: {
      name: 'find_patterns',
      description: 'Find anti-patterns, design patterns, code smells, and security risks',
      personas: ['developer'],
      category: 'code-analysis',
      tags: ['patterns', 'anti-pattern', 'code-smell', 'security'],
      complexity: 'intermediate',
    },
  },
  refactor_suggestions: {
    definition: refactor_suggestions,
    executor: refactor_suggestions_executor,
    metadata: {
      name: 'refactor_suggestions',
      description: 'Get refactoring suggestions for code improvement',
      personas: ['developer'],
      category: 'code-analysis',
      tags: ['refactor', 'improve', 'code-quality'],
      complexity: 'beginner',
    },
  },

  // ==================== Utility Tools ====================
  convert_format: {
    definition: convert_format,
    executor: convert_format_executor,
    metadata: {
      name: 'convert_format',
      description: 'Convert data between formats (JSON, CSV, Markdown)',
      personas: ['data-analyst', 'office-worker', 'developer'],
      category: 'utility',
      tags: ['convert', 'format', 'transform'],
      complexity: 'beginner',
    },
  },
  aggregate_data: {
    definition: aggregate_data,
    executor: aggregate_data_executor,
    metadata: {
      name: 'aggregate_data',
      description:
        'Aggregate data with group-by and statistics (sum, avg, min, max, count, unique)',
      personas: ['data-analyst', 'office-worker'],
      category: 'utility',
      tags: ['aggregate', 'group', 'statistics'],
      complexity: 'intermediate',
    },
  },
  transform_data: {
    definition: transform_data,
    executor: transform_data_executor,
    metadata: {
      name: 'transform_data',
      description: 'Transform data (rename, filter, select, drop columns)',
      personas: ['data-analyst', 'office-worker'],
      category: 'utility',
      tags: ['transform', 'columns', 'filter'],
      complexity: 'beginner',
    },
  },
}

// ============================================================================
// Persona-based Tool Filtering
// ============================================================================

/**
 * Get new tools filtered by user persona
 */
export function getNewToolsForPersona(persona: UserPersona): ToolEntry[] {
  return Object.values(NEW_TOOL_REGISTRY)
    .filter(
      (tool) =>
        tool.metadata.personas.includes(persona) || tool.metadata.personas.includes('general')
    )
    .map((tool) => ({
      definition: tool.definition,
      executor: tool.executor,
    }))
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): ToolEntry[] {
  return Object.values(NEW_TOOL_REGISTRY)
    .filter((tool) => tool.metadata.category === category)
    .map((tool) => ({
      definition: tool.definition,
      executor: tool.executor,
    }))
}

/**
 * Get tools by tag
 */
export function getToolsByTag(tag: string): ToolEntry[] {
  return Object.values(NEW_TOOL_REGISTRY)
    .filter((tool) => tool.metadata.tags.includes(tag))
    .map((tool) => ({
      definition: tool.definition,
      executor: tool.executor,
    }))
}

/**
 * Get all new tool definitions (for OpenAI function calling)
 */
export function getAllNewToolDefinitions(): ToolDefinition[] {
  return Object.values(NEW_TOOL_REGISTRY).map((tool) => tool.definition)
}

/**
 * Get tool executor by name
 */
export function getToolExecutor(name: string): ToolExecutor | undefined {
  return NEW_TOOL_REGISTRY[name]?.executor
}

/**
 * Get tool metadata by name
 */
export function getToolMetadata(name: string): ToolMetadata | undefined {
  return NEW_TOOL_REGISTRY[name]?.metadata
}

// ============================================================================
// Tool Recommendations by Persona
// ============================================================================

export const PERSONA_TOOL_RECOMMENDATIONS: Record<UserPersona, string[]> = {
  developer: [
    // From existing tools
    'file_read',
    'file_write',
    'file_edit',
    'grep',
    'extract_symbols',
    'find_references',
    'go_to_definition',
    'batch_edit',
    'javascript_exec',
    'python_exec',
    // New tools
    'analyze_code',
    'find_patterns',
    'refactor_suggestions',
  ],
  'data-analyst': [
    // From existing tools
    'file_read',
    'analyze_data',
    'generate_chart',
    'filter_data',
    'aggregate_data',
    // New tools
    'read_excel',
    'analyze_excel',
    'generate_chart',
    'export_visualization',
    'data_summary',
    't_test',
    'correlation',
    'anova',
    'python_exec',
  ],
  student: [
    // From existing tools
    'file_read',
    // New tools
    'explain',
    'create_learning_plan',
    'solve_step_by_step',
    'javascript_exec',
    'python_exec',
    't_test',
    'correlation',
  ],
  'office-worker': [
    // From existing tools
    'file_read',
    'file_write',
    'file_batch',
    // New tools
    'read_excel',
    'analyze_excel',
    'export_to_csv',
    'query_excel',
  ],
  general: ['file_read', 'list_files', 'explain'],
}

// ============================================================================
// Default exports
// ============================================================================

export default NEW_TOOL_REGISTRY
