/**
 * Tests for lib/dragdrop.ts — dropped-folder expansion.
 */

import { describe, it, expect } from 'vitest'
import {
  collectFileSystemHandles,
  readDirFilesRecursive,
  extractDroppedFiles,
  MAX_DROPPED_FILES,
} from './dragdrop'

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

function makeFileHandle(name: string, content: string): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    getFile: async () =>
      new File([content], name, { type: 'text/plain' }),
  } as unknown as FileSystemFileHandle
}

interface DirOptions {
  children?: Map<string, FileSystemHandle>
}
function makeDirHandle(
  name: string,
  { children = new Map<string, FileSystemHandle>() }: DirOptions = {},
): FileSystemDirectoryHandle {
  const handle = {
    kind: 'directory',
    name,
    async *entries() {
      for (const [entryName, child] of children) {
        yield [entryName, child] as [string, FileSystemHandle]
      }
    },
  }
  return handle as unknown as FileSystemDirectoryHandle
}

function makeDataTransfer(opts: {
  files?: File[]
  handles?: (FileSystemHandle | null)[]
}): DataTransfer {
  const { files = [], handles = [] } = opts
  return {
    files,
    items: handles.map((handle) => ({
      kind: 'file',
      type: '',
      getAsFileSystemHandle: async () => handle,
    })),
  } as unknown as DataTransfer
}

// ---------------------------------------------------------------------------
// collectFileSystemHandles
// ---------------------------------------------------------------------------

describe('collectFileSystemHandles', () => {
  it('collects handle promises synchronously', () => {
    const handle = makeDirHandle('docs')
    const dt = makeDataTransfer({ handles: [handle] })
    const promises = collectFileSystemHandles(dt)
    expect(promises).toHaveLength(1)
    void promises[0].then((h) => expect(h?.name).toBe('docs'))
  })

  it('returns empty array when API is unavailable', () => {
    const dt = {
      files: [] as File[],
      items: [{ kind: 'file', type: 'text/plain' }],
    } as unknown as DataTransfer
    expect(collectFileSystemHandles(dt)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// readDirFilesRecursive
// ---------------------------------------------------------------------------

describe('readDirFilesRecursive', () => {
  it('flattens nested dirs and rewrites names to relative paths', async () => {
    const tree = makeDirHandle('root', {
      children: new Map<string, FileSystemHandle>([
        ['a.txt', makeFileHandle('a.txt', 'A')],
        [
          'sub',
          makeDirHandle('sub', {
            children: new Map<string, FileSystemHandle>([
              ['b.md', makeFileHandle('b.md', 'B')],
              [
                'deep',
                makeDirHandle('deep', {
                  children: new Map<string, FileSystemHandle>([
                    ['c.png', makeFileHandle('c.png', 'C')],
                  ]),
                }),
              ],
            ]),
          }),
        ],
      ]),
    })

    const files = await readDirFilesRecursive(tree)
    expect(files.map((f) => f.name)).toEqual(['a.txt', 'sub/b.md', 'sub/deep/c.png'])
    const text = await files[1]!.text()
    expect(text).toBe('B')
  })

  it('skips node_modules and .git', async () => {
    const tree = makeDirHandle('root', {
      children: new Map<string, FileSystemHandle>([
        ['node_modules', makeDirHandle('node_modules')],
        ['.git', makeDirHandle('.git')],
        ['keep.txt', makeFileHandle('keep.txt', 'K')],
      ]),
    })

    const files = await readDirFilesRecursive(tree)
    expect(files.map((f) => f.name)).toEqual(['keep.txt'])
  })

  it('enforces the per-drop file budget', async () => {
    const children = new Map<string, FileSystemHandle>()
    for (let i = 0; i < 5; i++) {
      children.set(`f${i}.txt`, makeFileHandle(`f${i}.txt`, 'x'))
    }
    const tree = makeDirHandle('root', { children })

    const files = await readDirFilesRecursive(tree, '', [], {
      remaining: 2,
      truncated: false,
    })
    expect(files).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// extractDroppedFiles
// ---------------------------------------------------------------------------

describe('extractDroppedFiles', () => {
  it('expands a dropped folder into its files', async () => {
    const folder = makeDirHandle('project', {
      children: new Map<string, FileSystemHandle>([
        ['README.md', makeFileHandle('README.md', 'hello')],
        [
          'src',
          makeDirHandle('src', {
            children: new Map<string, FileSystemHandle>([['a.ts', makeFileHandle('a.ts', 'x')]]),
          }),
        ],
      ]),
    })
    const dt = makeDataTransfer({ handles: [folder] })

    const { files, truncated } = await extractDroppedFiles(dt)
    expect(truncated).toBe(false)
    expect(files.map((f) => f.name)).toEqual(['README.md', 'src/a.ts'])
  })

  it('skips the folder placeholder File that Chromium provides', async () => {
    const folder = makeDirHandle('project', {
      children: new Map<string, FileSystemHandle>([['README.md', makeFileHandle('README.md', 'hi')]]),
    })
    const dt = makeDataTransfer({
      files: [new File([], 'project', { type: '' })], // zero-size placeholder
      handles: [folder],
    })

    const { files } = await extractDroppedFiles(dt)
    expect(files.map((f) => f.name)).toEqual(['README.md'])
  })

  it('keeps plain files untouched when no folders are dropped', async () => {
    const file = new File(['abc'], 'notes.txt', { type: 'text/plain' })
    const handle = makeFileHandle('notes.txt', 'abc')
    const dt = makeDataTransfer({ files: [file], handles: [handle] })

    const { files } = await extractDroppedFiles(dt)
    expect(files).toEqual([file])
  })

  it('falls back to plain files when handles API is missing (Firefox/Safari)', async () => {
    const file = new File(['abc'], 'notes.txt', { type: 'text/plain' })
    const dt = makeDataTransfer({ files: [file] })

    const { files, truncated } = await extractDroppedFiles(dt)
    expect(files).toEqual([file])
    expect(truncated).toBe(false)
  })

  it('reports truncation when a folder exceeds MAX_DROPPED_FILES', async () => {
    const children = new Map<string, FileSystemHandle>()
    const total = MAX_DROPPED_FILES + 5
    for (let i = 0; i < total; i++) {
      children.set(`f${i}.txt`, makeFileHandle(`f${i}.txt`, 'x'))
    }
    const folder = makeDirHandle('big', { children })
    const dt = makeDataTransfer({ handles: [folder] })

    const { files, truncated } = await extractDroppedFiles(dt)
    expect(files).toHaveLength(MAX_DROPPED_FILES)
    expect(truncated).toBe(true)
  })

  it('uses file handles when dataTransfer.files is empty', async () => {
    const handle = makeFileHandle('only.txt', 'content')
    const dt = makeDataTransfer({ files: [], handles: [handle] })

    const { files } = await extractDroppedFiles(dt)
    expect(files.map((f) => f.name)).toEqual(['only.txt'])
  })
})
