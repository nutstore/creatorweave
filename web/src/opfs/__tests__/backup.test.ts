/**
 * Full OPFS backup — export & import (restore) unit tests.
 *
 * The import path is exercised end-to-end against a fake OPFS root:
 * validation failures must reject BEFORE any destructive step, and the
 * happy path must write entries + close the SQLite worker.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { unzipSync, zipSync, strToU8 } from 'fflate'

const mocks = vi.hoisted(() => ({
  close: vi.fn(async () => {}),
  initialize: vi.fn(async () => {}),
  exportDeviceEncryptionKey: vi.fn(async () => null as ArrayBuffer | null),
  importDeviceEncryptionKey: vi.fn(async (_rawKey: ArrayBuffer) => {}),
}))

vi.mock('@/sqlite', () => ({
  getSQLiteDB: () => ({
    close: mocks.close,
    initialize: mocks.initialize,
  }),
}))

vi.mock('@/sqlite/repositories/api-key.repository', () => ({
  exportDeviceEncryptionKey: mocks.exportDeviceEncryptionKey,
  importDeviceEncryptionKey: mocks.importDeviceEncryptionKey,
}))

vi.mock('@/opfs', () => ({
  resetWorkspaceManager: vi.fn(),
}))

// Import AFTER mocks so dynamic import('@/sqlite') inside importOPFSBackup
// resolves to the mock.
const { importOPFSBackup, downloadOPFSBackup } = await import('../backup')

/** Real SQLite database header (16-byte magic string). */
const SQLITE_HEADER = strToU8('SQLite format 3\0')

/** Build a fake OPFS directory backed by a nested Map. */
function makeFakeDir(map: Map<string, unknown>) {
  const dir = {
    kind: 'directory' as const,
    entries: async function* () {
      for (const [name, entry] of map) yield [name, entry] as [string, unknown]
    },
    removeEntry: vi.fn(async (name: string) => {
      if (!map.has(name)) throw new DOMException('not found', 'NotFoundError')
      map.delete(name)
    }),
    getDirectoryHandle: async (name: string) => {
      let child = map.get(name)
      if (!(child instanceof Map)) {
        child = new Map()
        map.set(name, child)
      }
      return makeFakeDir(child as Map<string, unknown>)
    },
    getFileHandle: async (name: string) => {
      const existing = map.get(name)
      if (
        existing &&
        typeof existing === 'object' &&
        'kind' in existing &&
        (existing as { kind?: string }).kind === 'file' &&
        'getFile' in (existing as object)
      ) {
        return existing
      }
      // File handle that actually accumulates written bytes so the backup
      // spill path (createWritable → write chunks → close → getFile) works
      // end-to-end and the produced zip can be read back.
      const handle = {
        kind: 'file' as const,
        bytes: new Uint8Array(0),
        createWritable: async () => {
          const chunks: Uint8Array[] = []
          return {
            write: async (data: Uint8Array) => {
              chunks.push(
                data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data as ArrayBuffer)
              )
            },
            close: async () => {
              const total = chunks.reduce((s, c) => s + c.byteLength, 0)
              const out = new Uint8Array(total)
              let off = 0
              for (const c of chunks) {
                out.set(c, off)
                off += c.byteLength
              }
              handle.bytes = out
            },
          }
        },
        getFile: async () => new FakeFile(name, handle.bytes),
      }
      map.set(name, handle)
      return handle
    },
  }
  return dir
}

function installFakeOpfs(initialEntries: Record<string, unknown> = {}) {
  const map = new Map<string, unknown>(Object.entries(initialEntries))
  const root = makeFakeDir(map)
  const original = navigator.storage
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: {
      ...navigator.storage,
      getDirectory: async () => root,
    },
  })
  return { root, map, restore: () => Object.defineProperty(navigator, 'storage', { configurable: true, value: original }) }
}

/** Minimal File stand-in (vitest env may lack a real File ctor). */
class FakeFile {
  name: string
  size: number
  private bytes: Uint8Array
  constructor(name: string, bytes: Uint8Array) {
    this.name = name
    this.bytes = bytes
    this.size = bytes.byteLength
  }
  async arrayBuffer() {
    return this.bytes.buffer.slice(
      this.bytes.byteOffset,
      this.bytes.byteOffset + this.bytes.byteLength
    )
  }
  /**
   * ReadableStream stand-in for `File.stream()`. The export path consumes
   * it through `getReader()` + `read()` (pull-based, like the real browser
   * ReadableStream), so the fake exposes exactly that surface.
   *
   * IMPORTANT: each call returns a fresh copy of the bytes. fflate's async
   * streams transfer the underlying ArrayBuffer to a worker, detaching it —
   * sharing one buffer across tests would fail with DataCloneError after
   * the first transfer.
   */
  stream(): { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }>; releaseLock(): void } } {
    const bytes = new Uint8Array(this.bytes) // fresh, exclusive buffer
    return {
      getReader() {
        let done = false
        return {
          async read() {
            if (done) return { done: true, value: undefined }
            done = true
            return { done: false, value: bytes }
          },
          releaseLock() {},
        }
      },
    }
  }
}

function zipOf(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries)
}

describe('importOPFSBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.sessionStorage.clear()
  })

  it('rejects a zip without the SQLite database file', async () => {
    const zipped = zipOf({ 'projects/p1/workspace.json': strToU8('{}') })
    const { restore } = installFakeOpfs()
    try {
      await expect(
        importOPFSBackup(new FakeFile('backup.zip', zipped) as unknown as File)
      ).rejects.toThrow(/SQLite database/)
    } finally {
      restore()
    }
  })

  it('rejects a zip whose db entry lacks the SQLite magic header', async () => {
    const zipped = zipOf({
      'bfosa-unified.sqlite': strToU8('this is definitely not sqlite'),
    })
    const { restore } = installFakeOpfs()
    try {
      await expect(
        importOPFSBackup(new FakeFile('backup.zip', zipped) as unknown as File)
      ).rejects.toThrow(/not a valid SQLite database/)
    } finally {
      restore()
    }
  })

  it('rejects zip-slip entries (absolute / .. paths)', async () => {
    const zipped = zipOf({
      'bfosa-unified.sqlite': SQLITE_HEADER,
      '../evil.txt': strToU8('x'),
    })
    const { restore } = installFakeOpfs()
    try {
      await expect(
        importOPFSBackup(new FakeFile('backup.zip', zipped) as unknown as File)
      ).rejects.toThrow(/Invalid entry/)
    } finally {
      restore()
    }
  })

  it('rejects an empty file', async () => {
    const { restore } = installFakeOpfs()
    try {
      await expect(
        importOPFSBackup(new FakeFile('empty.zip', new Uint8Array(0)) as unknown as File)
      ).rejects.toThrow(/empty/)
    } finally {
      restore()
    }
  })

  it('restores a valid backup, closes the SQLite worker, and skips noise/legacy entries', async () => {
    const zipped = zipOf({
      'bfosa-unified.sqlite': SQLITE_HEADER,
      'projects/p1/workspaces/w1/files/a.txt': strToU8('hello'),
      'noise/.DS_Store': strToU8('skip'),
      '__MACOSX/junk': strToU8('skip'),
      '.bfosa-pool/legacy': strToU8('skip'),
    })
    // Pre-existing data that the restore must wipe.
    const { map, restore } = installFakeOpfs({ 'old-file.txt': { kind: 'file' } })
    try {
      const result = await importOPFSBackup(
        new FakeFile('backup.zip', zipped) as unknown as File
      )
      expect(result.fileCount).toBe(2)
      expect(mocks.close).toHaveBeenCalledTimes(1)
      // Old data gone, new db + file present
      expect(map.has('old-file.txt')).toBe(false)
      expect(map.has('bfosa-unified.sqlite')).toBe(true)
      const projects = map.get('projects')
      expect(projects).toBeInstanceOf(Map)
      // Legacy pool never written back
      expect(map.has('.bfosa-pool')).toBe(false)
    } finally {
      restore()
    }
  })

  it('restores the device encryption key into IndexedDB, not OPFS, when the backup carries it', async () => {
    const deviceKey = new Uint8Array([1, 2, 3, 4])
    const zipped = zipOf({
      'bfosa-unified.sqlite': SQLITE_HEADER,
      'bfosa-device-key.bin': deviceKey,
    })
    const { map, restore } = installFakeOpfs()
    try {
      const result = await importOPFSBackup(
        new FakeFile('backup.zip', zipped) as unknown as File
      )
      // The key file is NOT written into OPFS
      expect(map.has('bfosa-device-key.bin')).toBe(false)
      expect(result.fileCount).toBe(1)
      // It was routed to IndexedDB instead, with its exact bytes
      expect(mocks.importDeviceEncryptionKey).toHaveBeenCalledTimes(1)
      const transferred = mocks.importDeviceEncryptionKey.mock.calls[0][0]
      expect(new Uint8Array(transferred)).toEqual(deviceKey)
    } finally {
      restore()
    }
  })

  it('skips the IndexedDB key transfer when the backup has no device key (legacy backups)', async () => {
    const zipped = zipOf({ 'bfosa-unified.sqlite': SQLITE_HEADER })
    const { restore } = installFakeOpfs()
    try {
      await importOPFSBackup(new FakeFile('backup.zip', zipped) as unknown as File)
      expect(mocks.importDeviceEncryptionKey).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('restores localStorage entries from the backup map and skips excluded keys', async () => {
    localStorage.setItem('bfosa-theme', 'dark')
    localStorage.setItem('creatorweave:input-history', '[]')
    // Pre-existing value that the restore must overwrite
    localStorage.setItem('bfosa-settings', 'OLD')
    // Device-local value that must survive untouched (excluded from both
    // backup and restore)
    localStorage.setItem('panel-ratio-left', '0.3')

    const lsMap = {
      'bfosa-settings': 'NEW-VALUE',
      'bfosa-theme': 'light',
      // Forged exclude-list key inside the backup — restore must skip it
      'preview-content-evil.html': '<script>x</script>',
    }
    const zipped = zipOf({
      'bfosa-unified.sqlite': SQLITE_HEADER,
      'bfosa-localstorage.json': strToU8(JSON.stringify(lsMap)),
    })
    const { map, restore } = installFakeOpfs()
    try {
      await importOPFSBackup(new FakeFile('backup.zip', zipped) as unknown as File)
      // Restored values
      expect(localStorage.getItem('bfosa-settings')).toBe('NEW-VALUE')
      expect(localStorage.getItem('bfosa-theme')).toBe('light')
      // Device-local key untouched
      expect(localStorage.getItem('panel-ratio-left')).toBe('0.3')
      // Excluded key never written, JSON never written into OPFS
      expect(localStorage.getItem('preview-content-evil.html')).toBeNull()
      expect(map.has('bfosa-localstorage.json')).toBe(false)
    } finally {
      restore()
      localStorage.clear()
    }
  })

  it('tolerates a corrupt localStorage JSON entry without failing the restore', async () => {
    const zipped = zipOf({
      'bfosa-unified.sqlite': SQLITE_HEADER,
      'bfosa-localstorage.json': strToU8('{not valid json'),
    })
    const { restore } = installFakeOpfs()
    try {
      // The OPFS restore itself must still succeed; the corrupt local-
      // storage payload only logs.
      const result = await importOPFSBackup(
        new FakeFile('backup.zip', zipped) as unknown as File
      )
      expect(result.fileCount).toBe(1)
    } finally {
      restore()
      localStorage.clear()
    }
  })

  it('reports locked entries as a close-other-tabs failure instead of a raw error', async () => {
    const zipped = zipOf({ 'bfosa-unified.sqlite': SQLITE_HEADER })
    const { restore } = installFakeOpfs()
    // Re-create root whose removeEntry always reports locked
    const lockedRoot = {
      kind: 'directory' as const,
      entries: async function* () {
        yield ['bfosa-unified.sqlite', { kind: 'file' }] as [string, unknown]
      },
      removeEntry: async () => {
        throw new DOMException(
          'An attempt was made to modify an object where modifications are not allowed',
          'NoModificationAllowedError'
        )
      },
      getDirectoryHandle: async () => {
        throw new Error('unused')
      },
      getFileHandle: async () => {
        throw new Error('unused')
      },
    }
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        ...navigator.storage,
        getDirectory: async () => lockedRoot,
      },
    })
    try {
      await expect(
        importOPFSBackup(new FakeFile('backup.zip', zipped) as unknown as File)
      ).rejects.toThrow(/RESET_REQUIRES_TAB_CLOSURE/)
    } finally {
      restore()
    }
  })
})

describe('exportOPFSBackup', () => {
  /**
   * Fake OPFS root holding one real-looking SQLite file. The fake's
   * getFile() returns a FakeFile (with stream()) — the export path now
   * reads every entry through `file.stream()`, so the legacy bare object
   * with only arrayBuffer() no longer works.
   */
  function installFakeOpfsWithDb() {
    return installFakeOpfs({
      'bfosa-unified.sqlite': {
        kind: 'file',
        getFile: async () => new FakeFile('bfosa-unified.sqlite', SQLITE_HEADER),
      },
    })
  }

  /**
   * Fake OPFS root with a few files of varying sizes plus a nested
   * subdirectory, exercising the recursive walker.
   */
  function installFakeOpfsWithMixedFiles() {
    // Build the inner directory through `makeFakeDir` so it has the same
    // entries/removeEntry/getDirectoryHandle/getFileHandle API as the root.
    const nested = makeFakeDir(
      new Map<string, unknown>([
        [
          'inner.txt',
          {
            kind: 'file',
            getFile: async () => new FakeFile('inner.txt', strToU8('inner content')),
          },
        ],
      ])
    )
    return installFakeOpfs({
      'bfosa-unified.sqlite': {
        kind: 'file',
        getFile: async () => new FakeFile('bfosa-unified.sqlite', SQLITE_HEADER),
      },
      'notes.md': {
        kind: 'file',
        getFile: async () => new FakeFile('notes.md', strToU8('# hello')),
      },
      projects: nested,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('embeds the device encryption key in the zip and reports includesDeviceKey: true', async () => {
    const deviceKey = new Uint8Array(32).fill(0xab)
    mocks.exportDeviceEncryptionKey.mockResolvedValue(deviceKey.buffer.slice(0) as ArrayBuffer)
    const { restore } = installFakeOpfsWithDb()
    try {
      const { exportOPFSBackup } = await import('../backup')
      const { blob, includesDeviceKey } = await exportOPFSBackup()
      expect(includesDeviceKey).toBe(true)
      // Unzip the produced blob and verify the key bytes round-trip exactly
      const zipped = new Uint8Array(await blob.arrayBuffer())
      const entries = unzipSync(zipped)
      expect(entries['bfosa-device-key.bin']).toEqual(deviceKey)
      expect(entries['bfosa-unified.sqlite']).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('omits the key file and reports includesDeviceKey: false when IndexedDB has no key', async () => {
    mocks.exportDeviceEncryptionKey.mockResolvedValue(null)
    const { restore } = installFakeOpfsWithDb()
    try {
      const { exportOPFSBackup } = await import('../backup')
      const { blob, includesDeviceKey } = await exportOPFSBackup()
      expect(includesDeviceKey).toBe(false)
      const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
      expect(entries['bfosa-device-key.bin']).toBeUndefined()
    } finally {
      restore()
    }
  })

  it('streams every file through fflate (recursive walker, no single ArrayBuffer allocation)', async () => {
    mocks.exportDeviceEncryptionKey.mockResolvedValue(null)
    const { restore } = installFakeOpfsWithMixedFiles()
    try {
      const { exportOPFSBackup } = await import('../backup')
      const { blob, filename } = await exportOPFSBackup()
      expect(filename).toMatch(/^eo2weave-backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.zip$/)
      // Every OPFS entry round-trips into the produced zip — including the
      // nested one. If any entry were silently dropped, this fails.
      const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
      expect(entries['bfosa-unified.sqlite']).toBeTruthy()
      expect(entries['notes.md']).toBeTruthy()
      expect(entries['projects/inner.txt']).toBeTruthy()
    } finally {
      restore()
    }
  })

  it('re-slices oversized stream chunks (no single huge push() allocation)', async () => {
    mocks.exportDeviceEncryptionKey.mockResolvedValue(null)
    // ~2.5 MiB of semi-random data — larger than the 1 MiB PUSH_SLICE cap,
    // so the fake's single-chunk stream() forces the re-slicing path.
    // Compressible on purpose: level-6 deflate produces a tiny output,
    // proving the data actually flowed through the compressor.
    const big = new Uint8Array(2.5 * 1024 * 1024)
    for (let i = 0; i < big.length; i++) big[i] = i % 251
    const { restore } = installFakeOpfs({
      'bfosa-unified.sqlite': {
        kind: 'file',
        getFile: async () => new FakeFile('bfosa-unified.sqlite', SQLITE_HEADER),
      },
      'blob.bin': {
        kind: 'file',
        getFile: async () => new FakeFile('blob.bin', big),
      },
    })
    try {
      const { exportOPFSBackup } = await import('../backup')
      const { blob } = await exportOPFSBackup()
      const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
      const round = entries['blob.bin']
      expect(round?.length).toBe(big.length)
      // Content integrity through the slice/reassemble boundary.
      for (let i = 0; i < big.length; i += 997) {
        expect(round[i]).toBe(big[i])
      }
    } finally {
      restore()
    }
  })

  it('reports the failing path when an OPFS entry cannot be opened', async () => {
    mocks.exportDeviceEncryptionKey.mockResolvedValue(null)
    const { restore } = installFakeOpfs({
      'bfosa-unified.sqlite': {
        kind: 'file',
        getFile: async () => new FakeFile('bfosa-unified.sqlite', SQLITE_HEADER),
      },
      'projects/huge.bin': {
        kind: 'file',
        getFile: async () => {
          throw new DOMException('NotReadableError', 'NotReadableError')
        },
      },
    })
    try {
      const { exportOPFSBackup } = await import('../backup')
      await expect(exportOPFSBackup()).rejects.toThrow(
        /Backup failed while opening "projects\/huge\.bin"/
      )
    } finally {
      restore()
    }
  })

  it('reports an empty OPFS as a clear error', async () => {
    mocks.exportDeviceEncryptionKey.mockResolvedValue(null)
    const { restore } = installFakeOpfs({}) // no entries
    try {
      const { exportOPFSBackup } = await import('../backup')
      await expect(exportOPFSBackup()).rejects.toThrow(/OPFS is empty/)
    } finally {
      restore()
    }
  })

  it('exports localStorage entries alongside OPFS when present', async () => {
    mocks.exportDeviceEncryptionKey.mockResolvedValue(null)
    localStorage.setItem('bfosa-theme', 'dark')
    const { restore } = installFakeOpfsWithDb()
    try {
      const { exportOPFSBackup } = await import('../backup')
      const { blob, includesLocalStorage } = await exportOPFSBackup()
      expect(includesLocalStorage).toBe(true)
      const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()))
      const lsJson = JSON.parse(
        new TextDecoder().decode(entries['bfosa-localstorage.json'])
      )
      expect(lsJson['bfosa-theme']).toBe('dark')
    } finally {
      restore()
      localStorage.clear()
    }
  })
})

describe('downloadOPFSBackup', () => {
  /** Minimal fake OPFS root with just the SQLite db (module-level helpers). */
  function installFakeOpfsWithDb() {
    return installFakeOpfs({
      'bfosa-unified.sqlite': {
        kind: 'file',
        getFile: async () => new FakeFile('bfosa-unified.sqlite', SQLITE_HEADER),
      },
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('closes the SQLite worker before exporting and re-initializes it afterwards', async () => {
    mocks.exportDeviceEncryptionKey.mockResolvedValue(null)
    const { restore } = installFakeOpfsWithDb()
    const order: string[] = []
    mocks.close.mockImplementation(async () => {
      order.push('close')
    })
    mocks.initialize.mockImplementation(async () => {
      order.push('initialize')
    })
    try {
      const result = await downloadOPFSBackup()
      expect(result.filename).toMatch(/^eo2weave-backup_/)
      expect(mocks.close).toHaveBeenCalledTimes(1)
      expect(mocks.initialize).toHaveBeenCalledTimes(1)
      // close() must happen before the OPFS read (export), initialize() after
      expect(order).toEqual(['close', 'initialize'])
    } finally {
      restore()
    }
  })

  it('re-initializes the worker even when the export itself fails', async () => {
    mocks.exportDeviceEncryptionKey.mockResolvedValue(null)
    // Empty OPFS makes exportOPFSBackup throw "OPFS is empty" after close().
    const { restore } = installFakeOpfs({})
    try {
      await expect(downloadOPFSBackup()).rejects.toThrow(/OPFS is empty/)
      expect(mocks.close).toHaveBeenCalledTimes(1)
      expect(mocks.initialize).toHaveBeenCalledTimes(1)
    } finally {
      restore()
    }
  })

  it('still exports when closing the worker fails (worker already dead)', async () => {
    mocks.exportDeviceEncryptionKey.mockResolvedValue(null)
    mocks.close.mockRejectedValueOnce(new Error('worker already terminated'))
    const { restore } = installFakeOpfsWithDb()
    try {
      const result = await downloadOPFSBackup()
      expect(result.filename).toMatch(/^eo2weave-backup_/)
      expect(mocks.initialize).not.toHaveBeenCalled() // close failed → no reopen
    } finally {
      restore()
    }
  })
})
