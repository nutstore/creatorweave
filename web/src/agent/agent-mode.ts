/**
 * Agent Mode System - defines read-only (Plan) and full-access (Act) modes.
 *
 * Plan mode: Only read-only tools are available (read, search, ls, etc.)
 * Act mode: All tools are available including write operations (write, edit, delete, etc.)
 */

/** Agent execution mode */
export type AgentMode = 'plan' | 'act'

/** Tool category for mode-based filtering */
export type ToolCategory = 'read' | 'write'

/** Tool metadata for mode classification */
export interface ToolModeMetadata {
  /** Tool name */
  name: string
  /** Tool category: read-only or write */
  category: ToolCategory
  /** Description of what this tool does in plan mode (if different) */
  planModeDescription?: string
}

/**
 * Classification of built-in tools by category.
 * Read tools: Safe to use in Plan mode
 * Write tools: Only available in Act mode
 */
export const TOOL_MODE_CLASSIFICATION: Map<string, ToolModeMetadata> = new Map([
  // ============================================================================
  // READ-ONLY TOOLS (Available in Plan mode)
  // ============================================================================
  ['read', { name: 'read', category: 'read' }],
  ['search', { name: 'search', category: 'read' }],
  ['ls', { name: 'ls', category: 'read' }],
  ['execute', { 
    name: 'execute', 
    category: 'read',
    planModeDescription: 'Execute code in sandbox (read-only in plan mode - no file modifications persisted)'
  }],
  ['analyze_data', { name: 'analyze_data', category: 'read' }],
  ['run_workflow', { name: 'run_workflow', category: 'read' }],
  
  // Git read tools
  ['git_status', { name: 'git_status', category: 'read' }],
  ['git_diff', { name: 'git_diff', category: 'read' }],
  ['git_log', { name: 'git_log', category: 'read' }],
  ['git_show', { name: 'git_show', category: 'read' }],
  
  // Skill tools (read-only)
  ['read_skill', { name: 'read_skill', category: 'read' }],
  ['read_skill_resource', { name: 'read_skill_resource', category: 'read' }],
  
  // ============================================================================
  // WRITE TOOLS (Only available in Act mode)
  // ============================================================================
  ['write', { name: 'write', category: 'write' }],
  ['edit', { name: 'edit', category: 'write' }],
  ['delete', { name: 'delete', category: 'write' }],
  
  // Git write tools
  ['git_restore', { name: 'git_restore', category: 'write' }],
])

/**
 * Get tool category by name.
 * Defaults to 'write' for safety (unknown tools are treated as write operations).
 */
export function getToolCategory(toolName: string): ToolCategory {
  const metadata = TOOL_MODE_CLASSIFICATION.get(toolName)
  return metadata?.category ?? 'write'
}

/**
 * Check if a tool is allowed in the given mode.
 */
export function isToolAllowedInMode(toolName: string, mode: AgentMode): boolean {
  if (mode === 'act') return true // Act mode allows all tools
  
  const category = getToolCategory(toolName)
  return category === 'read'
}

/**
 * Get list of allowed tool names for a given mode.
 */
export function getAllowedToolsForMode(mode: AgentMode, allTools: string[]): string[] {
  if (mode === 'act') return allTools
  return allTools.filter(tool => isToolAllowedInMode(tool, mode))
}

/**
 * Get mode display name for UI
 */
export function getModeDisplayName(mode: AgentMode): string {
  return mode === 'plan' ? 'Plan Mode' : 'Act Mode'
}

/**
 * Get mode description for UI
 */
export function getModeDescription(mode: AgentMode): string {
  return mode === 'plan'
    ? 'Read-only mode. Agent can analyze and plan but cannot modify files.'
    : 'Full-access mode. Agent can read, write, and modify files.'
}

/**
 * Get icon for mode
 */
export function getModeIcon(mode: AgentMode): string {
  return mode === 'plan' ? '🔍' : '⚡'
}
