import { describe, expect, it, vi } from 'vitest'
import { WorkspaceRuntime } from '../workspace-runtime'

describe('WorkspaceRuntime content-type aware reads', () => {
  it('reads binary file from files/ as ArrayBuffer by path type', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    const file = new File([new Uint8Array([0, 255, 1, 2])], 'image.png', { type: 'image/png' })
    const fileHandle = { getFile: vi.fn(async () => file) }
    const filesDir = {
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn(async () => fileHandle),
    }
    runtime.getFilesDir = vi.fn(async () => filesDir)

    const result = await runtime.readFromFilesDir('image.png')

    expect(result?.contentType).toBe('binary')
    expect(result?.content).toBeInstanceOf(ArrayBuffer)
  })

  it('reads text file from files/ as string by path type', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    const file = new File(['const a = 1\n'], 'main.ts', { type: 'text/plain' })
    const fileHandle = { getFile: vi.fn(async () => file) }
    const filesDir = {
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn(async () => fileHandle),
    }
    runtime.getFilesDir = vi.fn(async () => filesDir)

    const result = await runtime.readFromFilesDir('main.ts')

    expect(result?.contentType).toBe('text')
    expect(result?.content).toBe('const a = 1\n')
  })

  it('reads binary file from .baseline/ as ArrayBuffer by path type', async () => {
    const runtime = new WorkspaceRuntime('w1', {} as FileSystemDirectoryHandle, '/tmp') as any
    const file = new File([new Uint8Array([3, 4, 5])], 'logo.png', { type: 'image/png' })
    const fileHandle = { getFile: vi.fn(async () => file) }
    const baselineDir = {
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn(async () => fileHandle),
    }
    runtime.getBaselineDir = vi.fn(async () => baselineDir)

    const result = await runtime.readFromBaselineDir('logo.png')

    expect(result?.contentType).toBe('binary')
    expect(result?.content).toBeInstanceOf(ArrayBuffer)
  })
})
