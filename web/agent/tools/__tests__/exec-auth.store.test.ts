import { afterEach, describe, expect, it } from 'vitest'
import { useExecAuthStore } from '../exec-auth.store'
import { useToolAuthStore } from '@/store/tool-auth.store'

/**
 * PR-1 migrated the exec auth queue into the unified tool-auth.store.
 * These tests keep validating the legacy exec-facing surface (same request
 * signature and FIFO semantics) while asserting through the unified store.
 */
describe('exec authorization store (legacy wrapper → unified queue)', () => {
  afterEach(() => {
    useToolAuthStore.getState().clear()
  })

  it('queues concurrent authorization requests in FIFO order', async () => {
    const first = useExecAuthStore.getState().request(['pnpm', 'run', 'build'], 'First command')
    const second = useExecAuthStore.getState().request(['pnpm', 'run', 'lint'], 'Second command')

    expect(useToolAuthStore.getState().pending?.detail).toBe('pnpm run build')
    expect(useToolAuthStore.getState().queue).toHaveLength(2)

    useExecAuthStore.getState().approve()
    await expect(first).resolves.toBe(true)
    expect(useToolAuthStore.getState().pending?.detail).toBe('pnpm run lint')

    useExecAuthStore.getState().deny()
    await expect(second).resolves.toBe(false)
    expect(useToolAuthStore.getState().pending).toBeNull()
    expect(useToolAuthStore.getState().queue).toEqual([])
  })

  it('renders the command as detail and never offers session memory', async () => {
    const request = useExecAuthStore.getState().request(['git', 'status'], 'Context')
    const pending = useToolAuthStore.getState().pending
    expect(pending?.toolName).toBe('exec')
    expect(pending?.detail).toBe('git status')
    expect(pending?.memoryKey).toBeNull()

    useExecAuthStore.getState().approve()
    await expect(request).resolves.toBe(true)
  })

  it('removes an aborted queued request without disturbing the active prompt', async () => {
    const first = useExecAuthStore.getState().request(['pnpm', 'run', 'build'], 'First command')
    const controller = new AbortController()
    const second = useExecAuthStore.getState().request(
      ['pnpm', 'run', 'lint'],
      'Second command',
      controller.signal,
    )

    controller.abort()
    await expect(second).resolves.toBe(false)
    expect(useToolAuthStore.getState().pending?.detail).toBe('pnpm run build')
    expect(useToolAuthStore.getState().queue).toHaveLength(1)

    useExecAuthStore.getState().approve()
    await expect(first).resolves.toBe(true)
  })

  it('denies every queued request when cleared', async () => {
    const first = useExecAuthStore.getState().request(['pnpm', 'run', 'build'], 'First command')
    const second = useExecAuthStore.getState().request(['pnpm', 'run', 'lint'], 'Second command')

    useExecAuthStore.getState().clear()

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    expect(useToolAuthStore.getState().pending).toBeNull()
    expect(useToolAuthStore.getState().queue).toEqual([])
  })

  it('denyAll denies the pending and every queued request at once', async () => {
    const first = useExecAuthStore.getState().request(['pnpm', 'run', 'build'], 'First command')
    const second = useExecAuthStore.getState().request(['pnpm', 'run', 'lint'], 'Second command')
    const third = useExecAuthStore.getState().request(['pnpm', 'run', 'test'], 'Third command')

    useExecAuthStore.getState().denyAll()

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    await expect(third).resolves.toBe(false)
    expect(useToolAuthStore.getState().pending).toBeNull()
    expect(useToolAuthStore.getState().queue).toEqual([])
  })
})
