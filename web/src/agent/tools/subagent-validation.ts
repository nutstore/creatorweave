/**
 * SubAgent input validation — §4.0 field validation rules.
 *
 * All validators throw {@link SubagentError} on failure so callers can
 * distinguish validation errors from runtime errors by checking `error.code`.
 */

import { SubagentError, SubagentErrorCode, type SubagentType } from './tool-types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

const VALID_SUBAGENT_TYPES = new Set<SubagentType>([
  'general-purpose',
  'explorer',
  'worker',
  'awaiter',
])

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export function validateDescription(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, 'description must be a string', { field: 'description' })
  }
  const trimmed = value.trim()
  if (trimmed.length < 1) {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, 'description must not be empty', { field: 'description' })
  }
  if (trimmed.length > 200) {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, `description must be ≤200 characters (got ${trimmed.length})`, { field: 'description' })
  }
  return trimmed
}

export function validatePrompt(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, 'prompt must be a string', { field: 'prompt' })
  }
  if (value.length < 1) {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, 'prompt must not be empty', { field: 'prompt' })
  }
  if (value.length > 100_000) {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, `prompt must be ≤100000 characters (got ${value.length})`, { field: 'prompt' })
  }
  return value
}

export function validateName(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, 'name must be a string', { field: 'name' })
  }
  const trimmed = value.trim()
  if (trimmed.length < 1) {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, 'name must not be empty', { field: 'name' })
  }
  if (trimmed.length > 64) {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, `name must be ≤64 characters (got ${trimmed.length})`, { field: 'name' })
  }
  if (!NAME_PATTERN.test(trimmed)) {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, 'name must match [a-zA-Z0-9_-]', { field: 'name' })
  }
  return trimmed
}

export function validateSubagentType(value: unknown): SubagentType {
  if (value === undefined || value === null) return 'general-purpose'
  if (typeof value !== 'string') {
    throw new SubagentError(SubagentErrorCode.INVALID_AGENT_TYPE, 'subagent_type must be a string', { field: 'subagent_type' })
  }
  if (!VALID_SUBAGENT_TYPES.has(value as SubagentType)) {
    throw new SubagentError(SubagentErrorCode.INVALID_AGENT_TYPE, `invalid subagent_type: "${value}"`, { field: 'subagent_type' })
  }
  return value as SubagentType
}

export function validateTimeoutMs(value: unknown, max = 3_600_000): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, 'timeout_ms must be a positive number', { field: 'timeout_ms' })
  }
  if (value > max) {
    throw new SubagentError(SubagentErrorCode.TIMEOUT_EXCEEDS_MAX, `timeout_ms must be ≤${max} (got ${value})`, { field: 'timeout_ms' })
  }
  return value
}

export function validateAgentId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 1) {
    throw new SubagentError(SubagentErrorCode.INVALID_INPUT, 'agentId must be a non-empty string', { field: 'agentId' })
  }
  return value.trim()
}

export function validateMessage(value: unknown): string {
  if (typeof value !== 'string') {
    throw new SubagentError(SubagentErrorCode.INVALID_MESSAGE, 'message must be a string')
  }
  if (value.trim().length < 1) {
    throw new SubagentError(SubagentErrorCode.INVALID_MESSAGE, 'message must not be empty')
  }
  return value
}
