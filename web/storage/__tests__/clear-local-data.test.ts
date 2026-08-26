import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    clearAllSQLiteTables: vi.fn(async () => {}),
    clearLegacySahPoolFromOPFSRoot: vi.fn(async () => true),
    initSQLiteDB: vi.fn(async () => {}),
    getSQLiteDB: vi.fn(() => ({
      queryFirst: vi.fn(async () => ({ ok: 1 })),
      getMode: vi.fn(() => 'opfs' as const),
    })),
    resetWorkspaceManager: vi.fn(),
  }
})

vi.mock('@/sqlite', () => ({
  clearAllSQLiteTables: mocks.clearAllSQLiteTables,
  clearLegacySahPoolFromOPFSRoot: mocks.clearLegacySahPoolFromOPFSRoot,
  initSQLiteDB: mocks.initSQLiteDB,
  getSQLiteDB: mocks.getSQLiteDB,
}))

vi.mock('@/opfs', () => ({
  resetWorkspaceManager: mocks.resetWorkspaceManager,
}))

describe('clearSQLiteAndProjectsDirectory', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    window.sessionStorage.clear()
  })

  it('retries deleting OPFS projects directory when temporarily locked', async () => {
    const removeEntry = vi
      .fn()
      .mockRejectedValueOnce(
        new DOMException(
          'An attempt was made to modify an object where modifications are not allowed',
          'NoModificationAllowedError'
        )
      )
      .mockResolvedValueOnce(undefined)

    const getDirectoryHandle = vi.fn(async () => ({ kind: 'directory' }))

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(async () => ({
          removeEntry,
          getDirectoryHandle,
        })),
      },
    })

    const { clearSQLiteAndProjectsDirectory } = await import('../init')

    await expect(clearSQLiteAndProjectsDirectory()).resolves.toBeUndefined()
    expect(mocks.clearLegacySahPoolFromOPFSRoot).toHaveBeenCalledTimes(1)
    expect(removeEntry).toHaveBeenCalledTimes(2)
    expect(getDirectoryHandle).toHaveBeenCalledWith('projects', { create: true })
  })

  it('retries clearing SQLite tables when database is temporarily inaccessible', async () => {
    mocks.clearAllSQLiteTables
      .mockRejectedValueOnce(
        new Error('DATABASE_INACCESSIBLE: Database connection lost. Please refresh the page.')
      )
      .mockResolvedValueOnce(undefined)

    const removeEntry = vi.fn(async () => undefined)
    const getDirectoryHandle = vi.fn(async () => ({ kind: 'directory' }))

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(async () => ({
          removeEntry,
          getDirectoryHandle,
        })),
      },
    })

    const { clearSQLiteAndProjectsDirectory } = await import('../init')

    await expect(clearSQLiteAndProjectsDirectory()).resolves.toBeUndefined()
    expect(mocks.clearLegacySahPoolFromOPFSRoot).toHaveBeenCalledTimes(2)
    expect(mocks.clearAllSQLiteTables).toHaveBeenCalledTimes(2)
  })

  it('retries clearing SQLite tables on NoModificationAllowed wording from browser', async () => {
    mocks.clearAllSQLiteTables
      .mockRejectedValueOnce(
        new Error('An attempt was made to modify an object where modifications are not allowed')
      )
      .mockResolvedValueOnce(undefined)

    const removeEntry = vi.fn(async () => undefined)
    const getDirectoryHandle = vi.fn(async () => ({ kind: 'directory' }))

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(async () => ({
          removeEntry,
          getDirectoryHandle,
        })),
      },
    })

    const { clearSQLiteAndProjectsDirectory } = await import('../init')

    await expect(clearSQLiteAndProjectsDirectory()).resolves.toBeUndefined()
    expect(mocks.clearAllSQLiteTables).toHaveBeenCalledTimes(2)
  })

  it('throws stable tab-closure error code when OPFS projects lock persists', async () => {
    mocks.clearAllSQLiteTables.mockResolvedValueOnce(undefined)
    const removeEntry = vi.fn(async () => {
      throw new DOMException(
        'An attempt was made to modify an object where modifications are not allowed',
        'NoModificationAllowedError'
      )
    })
    const getDirectoryHandle = vi.fn(async () => ({ kind: 'directory' }))

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(async () => ({
          removeEntry,
          getDirectoryHandle,
        })),
      },
    })

    const { clearSQLiteAndProjectsDirectory } = await import('../init')
    await expect(clearSQLiteAndProjectsDirectory()).rejects.toThrow('RESET_REQUIRES_TAB_CLOSURE')
  })

  it('preserves API key tables when clearing local data', async () => {
    mocks.clearAllSQLiteTables.mockResolvedValueOnce(undefined)
    const removeEntry = vi.fn(async () => undefined)
    const getDirectoryHandle = vi.fn(async () => ({ kind: 'directory' }))

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(async () => ({
          removeEntry,
          getDirectoryHandle,
        })),
      },
    })

    const { clearSQLiteAndProjectsDirectory } = await import('../init')
    await expect(clearSQLiteAndProjectsDirectory()).resolves.toBeUndefined()
    expect(mocks.clearAllSQLiteTables).toHaveBeenCalledWith({
      preserveTables: ['api_keys', 'encryption_metadata'],
      allowOpfsFileResetFallback: false,
    })
  })
})
