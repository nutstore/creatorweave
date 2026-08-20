import { describe, expect, it, vi } from 'vitest'
import { CompositeExecutor } from '../executor-composite'
import type { DiskExecutor, DiskRoot } from '../executor'

function createExecutor(backend: DiskExecutor['backend']): DiskExecutor {
  return {
    backend,
    listRoots: vi.fn(async (): Promise<DiskRoot[]> => []),
    authorizeRoot: vi.fn(),
    revokeRoot: vi.fn(),
    hydrateRoot: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    delete: vi.fn(),
    stat: vi.fn(),
    listDir: vi.fn(),
  }
}

describe('CompositeExecutor', () => {
  it('routes scope IDs to Native Host and compound root IDs to FS Access', async () => {
    const fsaccess = createExecutor('fsaccess')
    const nativeHost = createExecutor('native-host')
    fsaccess.stat = vi.fn(async () => null)
    nativeHost.stat = vi.fn(async () => null)
    const executor = new CompositeExecutor(fsaccess, nativeHost)

    await executor.stat('project-a:browser-root', 'src/main.ts')
    await executor.stat('scope_123', 'src/main.ts')

    expect(fsaccess.stat).toHaveBeenCalledWith('project-a:browser-root', 'src/main.ts')
    expect(nativeHost.stat).toHaveBeenCalledWith('scope_123', 'src/main.ts')
  })

  it('does not fall back to FS Access when a Native Host operation fails', async () => {
    const fsaccess = createExecutor('fsaccess')
    const nativeHost = createExecutor('native-host')
    nativeHost.read = vi.fn(async () => {
      throw new Error('native host disconnected')
    })
    const executor = new CompositeExecutor(fsaccess, nativeHost)

    await expect(executor.read('scope_123', 'src/main.ts')).rejects.toThrow('native host disconnected')
    expect(fsaccess.read).not.toHaveBeenCalled()
  })
})
