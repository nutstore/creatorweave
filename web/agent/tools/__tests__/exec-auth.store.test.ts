import { afterEach, describe, expect, it } from 'vitest'
import { useExecAuthStore } from '../exec-auth.store'

describe('exec authorization store', () => {
  afterEach(() => {
    useExecAuthStore.getState().clear()
  })

  it('queues concurrent authorization requests in FIFO order', async () => {
    const first = useExecAuthStore.getState().request(['pnpm', 'run', 'build'], 'First command')
    const second = useExecAuthStore.getState().request(['pnpm', 'run', 'lint'], 'Second command')

    expect(useExecAuthStore.getState().pending?.command).toEqual(['pnpm', 'run', 'build'])
    expect(useExecAuthStore.getState().queue).toHaveLength(2)

    useExecAuthStore.getState().approve()
    await expect(first).resolves.toBe(true)
    expect(useExecAuthStore.getState().pending?.command).toEqual(['pnpm', 'run', 'lint'])

    useExecAuthStore.getState().deny()
    await expect(second).resolves.toBe(false)
    expect(useExecAuthStore.getState().pending).toBeNull()
    expect(useExecAuthStore.getState().queue).toEqual([])
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
    expect(useExecAuthStore.getState().pending?.command).toEqual(['pnpm', 'run', 'build'])
    expect(useExecAuthStore.getState().queue).toHaveLength(1)

    useExecAuthStore.getState().approve()
    await expect(first).resolves.toBe(true)
  })

  it('denies every queued request when cleared', async () => {
    const first = useExecAuthStore.getState().request(['pnpm', 'run', 'build'], 'First command')
    const second = useExecAuthStore.getState().request(['pnpm', 'run', 'lint'], 'Second command')

    useExecAuthStore.getState().clear()

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    expect(useExecAuthStore.getState().pending).toBeNull()
    expect(useExecAuthStore.getState().queue).toEqual([])
  })

  it('denyAll denies the pending and every queued request at once', async () => {
    const first = useExecAuthStore.getState().request(['pnpm', 'run', 'build'], 'First command')
    const second = useExecAuthStore.getState().request(['pnpm', 'run', 'lint'], 'Second command')
    const third = useExecAuthStore.getState().request(['pnpm', 'run', 'test'], 'Third command')

    useExecAuthStore.getState().denyAll()

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    await expect(third).resolves.toBe(false)
    expect(useExecAuthStore.getState().pending).toBeNull()
    expect(useExecAuthStore.getState().queue).toEqual([])
  })
})
