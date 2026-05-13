/**
 * Switch Agent Mode Tool - allows the agent to switch between Plan and Act modes.
 *
 * This is a meta-tool: it doesn't modify files, but changes the agent's own execution mode.
 * It is classified as a "read" tool so it's available in both Plan and Act modes.
 */

import type { ToolDefinition, ToolExecutor, ToolPromptDoc } from './tool-types'
import type { AgentMode } from '../agent-mode'
import {
  getCurrentWorkspaceAgentMode,
  setCurrentWorkspaceAgentMode,
} from '@/store/workspace-preferences.store'

export const switchAgentModeDefinition: ToolDefinition = {
  type: 'function',
  function: {
    name: 'switch_agent_mode',
    description: [
      'Switch the agent execution mode between Plan (read-only) and Act (full access).',
      'Use this tool when you determine that the current mode is not appropriate for the task at hand.',
      'For example, switch to Act mode when analysis is complete and you need to make file changes,',
      'or switch to Plan mode when you want to do a read-only review before making further changes.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['plan', 'act'],
          description: 'The target mode to switch to.',
        },
        reason: {
          type: 'string',
          description:
            'Brief explanation of why the mode switch is needed. This will be shown to the user.',
        },
      },
      required: ['mode', 'reason'],
    },
  },
}

/**
 * Callback type for mode switch events.
 * Called when the agent successfully switches its own mode.
 */
export type OnModeSwitched = (payload: {
  newMode: AgentMode
  previousMode: AgentMode
  reason: string
}) => void

/**
 * Create an executor for switch_agent_mode.
 *
 * The executor reads/writes mode from the workspace-preferences store.
 */
export function createSwitchModeExecutor(opts?: {
  /** Optional callback when mode is switched */
  onModeSwitched?: OnModeSwitched
}): ToolExecutor {
  return async (args: Record<string, unknown>) => {
    const { mode, reason } = args as { mode: AgentMode; reason: string }
    const currentMode = getCurrentWorkspaceAgentMode()

    if (mode === currentMode) {
      return JSON.stringify({
        success: false,
        message: `Already in ${mode} mode. No switch needed.`,
        current_mode: mode,
      })
    }

    const previousMode = currentMode

    // Perform the switch in workspace-preferences store
    setCurrentWorkspaceAgentMode(mode)

    // Notify callback (for AgentLoop to update its internal state)
    opts?.onModeSwitched?.({ newMode: mode, previousMode, reason })

    return JSON.stringify({
      success: true,
      message: `Switched from ${previousMode} to ${mode} mode.`,
      reason,
      previous_mode: previousMode,
      current_mode: mode,
      hint:
        mode === 'act'
          ? 'Write tools (write, edit, delete) are now available for use.'
          : 'Only read-only tools are available. Write operations are disabled.',
    })
  }
}

export const switchModePromptDoc: ToolPromptDoc = {
  category: 'meta',
  section: '### Agent Mode Switching',
  lines: [
    '- `switch_agent_mode(mode, reason)` - Switch between Plan (read-only) and Act (full access) modes',
  ],
}