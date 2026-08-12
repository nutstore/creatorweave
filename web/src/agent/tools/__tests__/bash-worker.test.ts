import { describe, expect, it } from 'vitest'
import { WorkerVfsBridgeFs } from '../bash-worker/worker-vfs-bridge'
import type { VfsRpcRequest, VfsRpcResponse } from '../bash-worker/protocol'

// ---------------------------------------------------------------------------
// Mock RPC invoker — captures requests and returns canned responses
// ---------------------------------------------------------------------------

function makeMockRpc(
  handlers: Partial<Record<string, (req: VfsRpcRequest) => VfsRpcResponse['result']>> = {},
) {
  const calls: VfsRpcRequest[] = []
  const invoker = async (req: VfsRpcRequest): Promise<VfsRpcResponse> => {
    calls.push(req)
    const handler = handlers[req.method]
    if (handler) {
      const result = handler(req)
      return { type: 'vfs-result', rpcId: req.rpcId, ok: true, result }
    }
    return { type: 'vfs-result', rpcId: req.rpcId, ok: false, error: `no mock for ${req.method}` }
  }
  return { invoker, calls }
}

describe('WorkerVfsBridgeFs', () => {
  // -------------------------------------------------------------------------
  // System filesystem (in-memory)
  // -------------------------------------------------------------------------

  it('reads and writes system files locally (no RPC)', async () => {
    const { invoker, calls } = makeMockRpc()
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    fs.writeFileSync('/bin/echo', 'echo stub')
    const content = await fs.readFile('/bin/echo')
    expect(content).toBe('echo stub')
    expect(calls.length).toBe(0) // no RPC needed
  })

  it('creates /dev/null as a black hole', async () => {
    const { invoker } = makeMockRpc()
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    // Write to /dev/null is silently consumed
    await fs.writeFile('/dev/null', 'anything')
    // /dev/null exists in sysFs
    expect(await fs.exists('/dev/null')).toBe(true)
    const content = await fs.readFile('/dev/null')
    expect(content).toBe('')
  })

  it('lists system directories', async () => {
    const { invoker } = makeMockRpc()
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    const entries = await fs.readdirWithFileTypes('/bin')
    // /bin exists (created in constructor)
    expect(entries.some(e => e.name === 'bin')).toBe(false) // /bin itself
    // Root listing
    const rootEntries = await fs.readdirWithFileTypes('/')
    expect(rootEntries.some(e => e.name === 'bin')).toBe(true)
    expect(rootEntries.some(e => e.name === 'workspace')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Workspace routing (RPC)
  // -------------------------------------------------------------------------

  it('routes workspace reads to RPC with correct relative path', async () => {
    const { invoker, calls } = makeMockRpc({
      readFile: (req) => `content of ${req.path}`,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['myroot'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    const content = await fs.readFile('/workspace/myroot/src/app.ts')
    expect(content).toBe('content of myroot/src/app.ts')
    expect(calls[0].backend).toBe('workspace')
    expect(calls[0].path).toBe('myroot/src/app.ts')
  })

  it('lists workspace root names from readdir', async () => {
    const { invoker } = makeMockRpc()
    const fs = new WorkerVfsBridgeFs(invoker, ['rootA', 'rootB'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    const entries = await fs.readdirWithFileTypes('/workspace')
    const names = entries.map(e => e.name)
    expect(names).toContain('rootA')
    expect(names).toContain('rootB')
  })

  it('routes workspace writes to RPC with content', async () => {
    const { invoker, calls } = makeMockRpc({
      writeFile: () => undefined,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    await fs.writeFile('/workspace/root/file.txt', 'hello')
    expect(calls[0].backend).toBe('workspace')
    expect(calls[0].path).toBe('root/file.txt')
    expect(calls[0].content).toBe('hello')
    expect(calls[0].encoding).toBe('text')
  })

  // -------------------------------------------------------------------------
  // Assets routing
  // -------------------------------------------------------------------------

  it('routes assets paths to assets backend', async () => {
    const { invoker, calls } = makeMockRpc({
      readFile: (req) => `asset:${req.path}`,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], true, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    const content = await fs.readFile('/assets/data.csv')
    expect(content).toBe('asset:data.csv')
    expect(calls[0].backend).toBe('assets')
    expect(calls[0].path).toBe('data.csv')
  })

  // -------------------------------------------------------------------------
  // Agent routing + permission checks
  // -------------------------------------------------------------------------

  it('routes agent paths to agent backend', async () => {
    const { invoker, calls } = makeMockRpc({
      readFile: (req) => `agent:${req.path}`,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, true, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    const content = await fs.readFile('/agents/IDENTITY.md')
    expect(content).toBe('agent:IDENTITY.md')
    expect(calls[0].backend).toBe('agent')
  })

  it('blocks subagent access to protected core files', async () => {
    const { invoker } = makeMockRpc()
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, true, {
      readOnly: false,
      restrictAgentCoreFiles: true,
    })

    await expect(fs.readFile('/agents/SOUL.md')).rejects.toThrow(/protected agent path/)
  })

  // -------------------------------------------------------------------------
  // Read-only mode (Plan mode)
  // -------------------------------------------------------------------------

  it('blocks workspace writes in read-only mode', async () => {
    const { invoker } = makeMockRpc()
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: true,
      restrictAgentCoreFiles: false,
    })

    await expect(fs.writeFile('/workspace/root/file.txt', 'x')).rejects.toThrow(
      /read-only mode/,
    )
  })

  it('allows system writes in read-only mode', async () => {
    const { invoker } = makeMockRpc()
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: true,
      restrictAgentCoreFiles: false,
    })

    // System file writes are local — read-only only affects workspace/assets/agent
    fs.writeFileSync('/tmp/test', 'data')
    expect(await fs.readFile('/tmp/test')).toBe('data')
  })

  // -------------------------------------------------------------------------
  // Binary encoding (latin1 roundtrip)
  // -------------------------------------------------------------------------

  it('serializes binary content as latin1 string for RPC', async () => {
    const { invoker, calls } = makeMockRpc({
      writeFile: () => undefined,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    // Bytes with high-bit values (0x80-0xFF) that UTF-8 would mangle
    const bytes = new Uint8Array([0x48, 0xe9, 0x6c, 0x6c, 0xf6])
    await fs.writeFile('/workspace/root/bin.dat', bytes, { encoding: 'binary' })

    expect(calls[0].encoding).toBe('binary')
    // latin1-shaped string: each char's code = one byte
    expect(calls[0].content).toBe(String.fromCharCode(0x48, 0xe9, 0x6c, 0x6c, 0xf6))
  })

  it('deserializes readFileBuffer latin1 response back to bytes', async () => {
    const latin1 = String.fromCharCode(0x48, 0xe9, 0x6c, 0x6c, 0xf6)
    const { invoker } = makeMockRpc({
      readFileBuffer: () => latin1,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    const bytes = await fs.readFileBuffer('/workspace/root/bin.dat')
    expect(bytes).toEqual(new Uint8Array([0x48, 0xe9, 0x6c, 0x6c, 0xf6]))
  })

  // -------------------------------------------------------------------------
  // Path normalization
  // -------------------------------------------------------------------------

  it('normalizes .. and . in paths', async () => {
    const { invoker, calls } = makeMockRpc({
      readFile: (req) => `ok:${req.path}`,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    await fs.readFile('/workspace/root/sub/../app.ts')
    expect(calls[0].path).toBe('root/app.ts')
  })

  // -------------------------------------------------------------------------
  // appendFile read-only guard (BUG 5 regression)
  // -------------------------------------------------------------------------

  it('blocks append in read-only mode', async () => {
    const { invoker } = makeMockRpc()
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: true,
      restrictAgentCoreFiles: false,
    })

    await expect(fs.appendFile('/workspace/root/file.txt', 'more')).rejects.toThrow(
      /read-only mode/,
    )
  })

  // -------------------------------------------------------------------------
  // cp delegates to RPC with recursive flag (BUG 3 regression)
  // -------------------------------------------------------------------------

  it('delegates cp to RPC with recursive flag', async () => {
    const { invoker, calls } = makeMockRpc({
      cp: () => undefined,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], false, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    await fs.cp('/workspace/root/src', '/workspace/root/dest', { recursive: true })
    expect(calls[0].method).toBe('cp')
    expect(calls[0].path).toBe('root/src')
    expect(calls[0].dest).toBe('root/dest')
    expect(calls[0].recursive).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Cross-backend cp (BUG 8 regression)
  // -------------------------------------------------------------------------

  it('copies single file across backends (workspace → assets)', async () => {
    const { invoker, calls } = makeMockRpc({
      readFile: (req) => `file:${req.path}`,
      writeFile: () => undefined,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], true, false, {
      readOnly: false,
      restrictAgentCoreFiles: false,
    })

    // Source in workspace, dest in assets — different backends
    await fs.cp('/workspace/root/src.txt', '/assets/backup.txt')

    // Should do readFile from workspace + writeFile to assets (NOT a single cp RPC)
    const readCall = calls.find(c => c.method === 'readFile')
    const writeCall = calls.find(c => c.method === 'writeFile')
    expect(readCall).toBeDefined()
    expect(readCall!.backend).toBe('workspace')
    expect(readCall!.path).toBe('root/src.txt')
    expect(writeCall).toBeDefined()
    expect(writeCall!.backend).toBe('assets')
    expect(writeCall!.path).toBe('backup.txt')
    expect(writeCall!.content).toBe('file:root/src.txt')

    // Should NOT send a single 'cp' RPC
    expect(calls.some(c => c.method === 'cp')).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Cross-backend cp read-only guard (known-limitation fix)
  // -------------------------------------------------------------------------

  it('blocks cross-backend cp write in read-only mode', async () => {
    const { invoker, calls } = makeMockRpc({
      readFile: () => 'data',
      writeFile: () => undefined,
    })
    const fs = new WorkerVfsBridgeFs(invoker, ['root'], true, false, {
      readOnly: true,
      restrictAgentCoreFiles: false,
    })

    // Even cross-backend cp must be blocked in read-only mode
    await expect(
      fs.cp('/workspace/root/src.txt', '/assets/backup.txt'),
    ).rejects.toThrow(/read-only mode/)

    // No RPC should have fired (not even the readFile)
    expect(calls.length).toBe(0)
  })
})
