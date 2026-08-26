/**
 * Natural Language Macro System - Types
 *
 * Allows recording sequences of tool calls and replaying them
 * with natural language triggers.
 */

//=============================================================================
// Types
//=============================================================================

/** Tool call in a macro */
export interface MacroToolCall {
  /** Tool name */
  name: string
  /** Tool arguments (can contain placeholders) */
  arguments: Record<string, unknown>
  /** Optional description of what this call does */
  description?: string
}

/** Recorded macro */
export interface Macro {
  /** Unique macro ID */
  id: string
  /** Macro display name */
  name: string
  /** Description of what the macro does */
  description: string
  /** Natural language trigger phrases */
  triggers: string[]
  /** Sequence of tool calls to execute */
  calls: MacroToolCall[]
  /** Parameter placeholders (e.g., {filePath}, {searchTerm}) */
  parameters: MacroParameter[]
  /** Creation timestamp */
  createdAt: number
  /** Last used timestamp */
  lastUsed?: number
  /** Usage count */
  usageCount: number
  /** Category for organization */
  category: MacroCategory
  /** Whether this is a built-in macro */
  builtin: boolean
}

/** Macro parameter definition */
export interface MacroParameter {
  /** Parameter name (used in placeholders) */
  name: string
  /** Display name */
  label: string
  /** Parameter type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object'
  /** Default value */
  default?: unknown
  /** Required flag */
  required: boolean
  /** Description */
  description?: string
}

/** Macro categories */
export type MacroCategory =
  | 'refactoring'
  | 'testing'
  | 'documentation'
  | 'analysis'
  | 'batch'
  | 'custom'

/** Macro recording state */
export interface MacroRecording {
  /** Recording session ID */
  id: string
  /** Recording start time */
  startedAt: number
  /** Recorded tool calls */
  calls: MacroToolCall[]
  /** Recording state */
  state: 'recording' | 'paused' | 'completed'
  /** Temporary name for the recording */
  name?: string
}

/** Macro execution result */
export interface MacroExecutionResult {
  /** Success flag */
  success: boolean
  /** Results from each tool call */
  results: Array<{
    tool: string
    success: boolean
    result?: string
    error?: string
  }>
  /** Total execution time (ms) */
  duration: number
}

/** Natural language match result */
export interface MacroMatch {
  /** Matched macro */
  macro: Macro
  /** Confidence score (0-1) */
  confidence: number
  /** Extracted parameters from natural language */
  parameters: Record<string, unknown>
  /** Matched trigger phrase */
  matchedTrigger: string
}
