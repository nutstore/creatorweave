/**
 * Unit tests for the shared tool timeout helper.
 */
import { describe, it, expect, vi } from 'vitest'
import { withToolTimeout, isToolTimeoutError, ToolTimeoutError } from '../tool-utils'

describe('withToolTimeout', () => {
  it('returns the original result when the promise resolves before timeout', async () => {
    const result = await withToolTimeout(
      Promise.resolve('hello'),
      10_000,
      'read',
    )
    expect(result).toBe('hello')
  })

  it('rejects with ToolTimeoutError when the promise exceeds the timeout', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 500))
    await expect(
      withToolTimeout(slow, 50, 'read'),
    ).rejects.toThrow('read: timed out after 50ms')
  })

  it('the timeout error is recognised by isToolTimeoutError', async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve('late'), 500))
    try {
      await withToolTimeout(slow, 50, 'write')
      expect.fail('should have thrown')
    } catch (error) {
      expect(isToolTimeoutError(error)).toBe(true)
      if (isToolTimeoutError(error)) {
        expect(error.toolName).toBe('write')
        expect(error.timeoutMs).toBe(50)
      }
    }
  })

  it('propagates the original rejection when the promise rejects before timeout', async () => {
    const failing = Promise.reject(new Error('disk full'))
    await expect(
      withToolTimeout(failing, 10_000, 'delete'),
    ).rejects.toThrow('disk full')
  })

  it('cleans up the timer after success (no unhandled rejection)', async () => {
    // If the timer isn't cleaned up, a lingering rejection could surface as
    // an unhandled promise rejection in downstream tests.
    const result = await withToolTimeout(Promise.resolve(42), 10_000, 'search')
    expect(result).toBe(42)
    // Give the event loop a tick to flush any stray timers
    await new Promise((r) => setTimeout(r, 60))
  })

  it('works with object results', async () => {
    const obj = { data: [1, 2, 3] }
    const result = await withToolTimeout(Promise.resolve(obj), 10_000, 'read')
    expect(result).toEqual(obj)
  })
})

describe('isToolTimeoutError', () => {
  it('returns true for ToolTimeoutError instances', () => {
    expect(isToolTimeoutError(new ToolTimeoutError('bash', 1000))).toBe(true)
  })

  it('returns false for generic errors', () => {
    expect(isToolTimeoutError(new Error('something else'))).toBe(false)
  })

  it('returns false for non-error values', () => {
    expect(isToolTimeoutError(null)).toBe(false)
    expect(isToolTimeoutError(undefined)).toBe(false)
    expect(isToolTimeoutError('string')).toBe(false)
  })
})

describe('ToolTimeoutError', () => {
  it('captures toolName and timeoutMs', () => {
    const err = new ToolTimeoutError('delete', 60_000)
    expect(err.toolName).toBe('delete')
    expect(err.timeoutMs).toBe(60_000)
    expect(err.message).toBe('delete: timed out after 60000ms')
    expect(err.name).toBe('ToolTimeoutError')
  })
})
