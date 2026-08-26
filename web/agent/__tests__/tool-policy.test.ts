import { describe, expect, it } from 'vitest'
import { createToolPolicyHooks } from '../tool-policy'

describe('tool-policy', () => {
  it('blocks mutating tool calls on protected paths', () => {
    const hooks = createToolPolicyHooks()
    const result = hooks.beforeToolCall({
      toolName: 'file_write',
      toolCallId: 'tc-1',
      args: { path: '.env', content: 'SECRET=1' },
    })
    expect(result?.block).toBe(true)
    expect(result?.reason).toContain('protected path')
  })

  it('does not block read-only calls on protected paths', () => {
    const hooks = createToolPolicyHooks()
    const result = hooks.beforeToolCall({
      toolName: 'file_read',
      toolCallId: 'tc-2',
      args: { path: '.env' },
    })
    expect(result).toBeUndefined()
  })

  it('does not block shell commands by default in browser mode', () => {
    const hooks = createToolPolicyHooks()
    const result = hooks.beforeToolCall({
      toolName: 'bash',
      toolCallId: 'tc-3',
      args: { command: 'rm -rf /' },
    })
    expect(result).toBeUndefined()
  })

  it('blocks dangerous shell commands when command guard is enabled', () => {
    const hooks = createToolPolicyHooks({ enableDangerousCommandGuard: true })
    const result = hooks.beforeToolCall({
      toolName: 'bash',
      toolCallId: 'tc-4',
      args: { command: 'rm -rf /' },
    })
    expect(result?.block).toBe(true)
    expect(result?.reason).toContain('dangerous pattern')
  })

  it('allows safe shell commands', () => {
    const hooks = createToolPolicyHooks({ enableDangerousCommandGuard: true })
    const result = hooks.beforeToolCall({
      toolName: 'bash',
      toolCallId: 'tc-5',
      args: { command: 'ls -la' },
    })
    expect(result).toBeUndefined()
  })
})
