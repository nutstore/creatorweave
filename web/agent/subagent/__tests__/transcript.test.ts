import { describe, expect, it, beforeEach } from 'vitest'
import { SubagentErrorCode } from '@/agent/tools/tool-types'
import { TranscriptWriter, TranscriptReader, TRANSCRIPT_SCHEMA_VERSION } from '../transcript'
import type { TranscriptEntry, TranscriptHeader } from '../transcript'
import type { Message } from '@/agent/message-types'

// ---------------------------------------------------------------------------
// In-memory OPFS mock
// ---------------------------------------------------------------------------

function createMemoryFile() {
  let content = ''
  return {
    getFile: () => ({
      text: async () => content,
      arrayBuffer: async () => new TextEncoder().encode(content).buffer,
    }),
    createWritable: async () => {
      let buffer = ''
      return {
        write: async (data: string | Uint8Array) => {
          if (typeof data === 'string') buffer += data
          else buffer += new TextDecoder().decode(data)
        },
        close: async () => { content += buffer },
        seek: async () => {},
        truncate: async () => {},
      }
    },
    setContent: (s: string) => { content = s },
  }
}

type MemoryFile = ReturnType<typeof createMemoryFile>

function createMockFileHandle(file: MemoryFile) {
  return {
    getFile: file.getFile,
    createWritable: file.createWritable,
    kind: 'file' as const,
    isSameEntry: async () => false,
    move: async () => {},
    remove: async () => { file.setContent('') },
  }
}

// ---------------------------------------------------------------------------
// TranscriptWriter tests
// ---------------------------------------------------------------------------

describe('TranscriptWriter', () => {
  let file: MemoryFile
  let handle: ReturnType<typeof createMockFileHandle>

  beforeEach(() => {
    file = createMemoryFile()
    handle = createMockFileHandle(file)
  })

  it('writes header and entries as JSONL', async () => {
    const writer = new TranscriptWriter(handle as unknown as FileSystemFileHandle, 'agent_1')
    await writer.open()
    const msg: Message = { id: 'm1', role: 'user', content: 'hello', timestamp: 1000 }
    await writer.append(msg)
    await writer.close()

    const text = await file.getFile().text()
    const lines = text.trim().split('\n')
    expect(lines.length).toBe(2)

    const header = JSON.parse(lines[0]) as TranscriptHeader
    expect(header.schema_version).toBe(TRANSCRIPT_SCHEMA_VERSION)
    expect(header.agent_id).toBe('agent_1')

    const entry = JSON.parse(lines[1]) as TranscriptEntry
    expect(entry.role).toBe('user')
    expect(entry.content).toBe('hello')
    expect(entry.seq).toBe(1)
  })

  it('tracks byte size', async () => {
    const writer = new TranscriptWriter(handle as unknown as FileSystemFileHandle, 'a')
    await writer.open()
    expect(writer.size).toBeGreaterThan(0)
    const before = writer.size
    await writer.append({ id: 'm1', role: 'user', content: 'test', timestamp: 1 })
    expect(writer.size).toBeGreaterThan(before)
    await writer.close()
  })

  it('no-op after close', async () => {
    const writer = new TranscriptWriter(handle as unknown as FileSystemFileHandle, 'a')
    await writer.open()
    await writer.close()
    const sizeBefore = writer.size
    await writer.append({ id: 'm1', role: 'user', content: 'after close', timestamp: 1 })
    expect(writer.size).toBe(sizeBefore)
  })

  it('includes tool_calls and tool_call_id for tool messages', async () => {
    const writer = new TranscriptWriter(handle as unknown as FileSystemFileHandle, 'a')
    await writer.open()
    await writer.append({
      id: 'm1', role: 'assistant', content: null, timestamp: 1,
      toolCalls: [{ id: 'tc1', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
    })
    await writer.append({
      id: 'm2', role: 'tool', content: 'file contents', timestamp: 2,
      toolCallId: 'tc1', name: 'read_file',
    })
    await writer.close()

    const text = await file.getFile().text()
    const lines = text.trim().split('\n')
    const assistant = JSON.parse(lines[1]) as TranscriptEntry
    expect(assistant.tool_calls).toHaveLength(1)
    expect(assistant.tool_calls![0].id).toBe('tc1')

    const tool = JSON.parse(lines[2]) as TranscriptEntry
    expect(tool.tool_call_id).toBe('tc1')
    expect(tool.tool_name).toBe('read_file')
  })
})

// ---------------------------------------------------------------------------
// TranscriptReader tests
// ---------------------------------------------------------------------------

describe('TranscriptReader', () => {
  it('reads valid transcript and returns messages', async () => {
    const file = createMemoryFile()
    const handle = createMockFileHandle(file)

    // Write a valid transcript
    const header = JSON.stringify({
      schema_version: TRANSCRIPT_SCHEMA_VERSION,
      agent_id: 'agent_1',
      created_at: 1000,
    })
    const entry1 = JSON.stringify({
      schema_version: TRANSCRIPT_SCHEMA_VERSION,
      seq: 1, role: 'user', content: 'hello', timestamp: 1001,
    })
    const entry2 = JSON.stringify({
      schema_version: TRANSCRIPT_SCHEMA_VERSION,
      seq: 2, role: 'assistant', content: 'world', timestamp: 1002,
    })
    file.setContent(`${header}\n${entry1}\n${entry2}\n`)

    const reader = new TranscriptReader(handle as unknown as FileSystemFileHandle)
    const result = await reader.read()

    expect(result.header.agent_id).toBe('agent_1')
    expect(result.messages).toHaveLength(2)
    expect(result.messages[0].role).toBe('user')
    expect(result.messages[0].content).toBe('hello')
    expect(result.messages[1].role).toBe('assistant')
    expect(result.entriesRecovered).toBe(2)
    expect(result.truncated).toBe(false)
  })

  it('throws TRANSCRIPT_CORRUPTED for empty file', async () => {
    const file = createMemoryFile()
    file.setContent('')
    const handle = createMockFileHandle(file)

    const reader = new TranscriptReader(handle as unknown as FileSystemFileHandle)
    await expect(reader.read()).rejects.toThrow()
    try { await reader.read() } catch (e) {
      expect((e as { code: string }).code).toBe(SubagentErrorCode.TRANSCRIPT_CORRUPTED)
    }
  })

  it('throws TRANSCRIPT_CORRUPTED for invalid header', async () => {
    const file = createMemoryFile()
    file.setContent('not json\n')
    const handle = createMockFileHandle(file)

    const reader = new TranscriptReader(handle as unknown as FileSystemFileHandle)
    try { await reader.read() } catch (e) {
      expect((e as { code: string }).code).toBe(SubagentErrorCode.TRANSCRIPT_CORRUPTED)
    }
  })

  it('throws TRANSCRIPT_CORRUPTED for wrong schema version', async () => {
    const file = createMemoryFile()
    file.setContent(JSON.stringify({ schema_version: '0.9', agent_id: 'a', created_at: 1 }) + '\n')
    const handle = createMockFileHandle(file)

    const reader = new TranscriptReader(handle as unknown as FileSystemFileHandle)
    try { await reader.read() } catch (e) {
      expect((e as { code: string }).code).toBe(SubagentErrorCode.TRANSCRIPT_CORRUPTED)
      expect((e as Error).message).toContain('0.9')
    }
  })

  it('skips malformed lines but reports truncated', async () => {
    const file = createMemoryFile()
    const handle = createMockFileHandle(file)
    const header = JSON.stringify({ schema_version: TRANSCRIPT_SCHEMA_VERSION, agent_id: 'a', created_at: 1 })
    const entry1 = JSON.stringify({ schema_version: TRANSCRIPT_SCHEMA_VERSION, seq: 1, role: 'user', content: 'ok', timestamp: 1 })
    file.setContent(`${header}\n${entry1}\nBROKEN LINE\n`)

    const reader = new TranscriptReader(handle as unknown as FileSystemFileHandle)
    const result = await reader.read()
    expect(result.messages).toHaveLength(1)
    expect(result.truncated).toBe(true)
  })

  it('cleans incomplete tool_use blocks (assistant with toolCalls but missing tool results)', async () => {
    const file = createMemoryFile()
    const handle = createMockFileHandle(file)
    const header = JSON.stringify({ schema_version: TRANSCRIPT_SCHEMA_VERSION, agent_id: 'a', created_at: 1 })
    const userMsg = JSON.stringify({ schema_version: TRANSCRIPT_SCHEMA_VERSION, seq: 1, role: 'user', content: 'do it', timestamp: 1 })
    const assistantMsg = JSON.stringify({
      schema_version: TRANSCRIPT_SCHEMA_VERSION, seq: 2, role: 'assistant', content: null, timestamp: 2,
      tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read', arguments: '{}' } }],
    })
    // No tool result for tc1!
    file.setContent(`${header}\n${userMsg}\n${assistantMsg}\n`)

    const reader = new TranscriptReader(handle as unknown as FileSystemFileHandle)
    const result = await reader.read()
    // Should remove the incomplete assistant tool_use block
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].role).toBe('user')
  })

  it('preserves complete tool_use blocks', async () => {
    const file = createMemoryFile()
    const handle = createMockFileHandle(file)
    const header = JSON.stringify({ schema_version: TRANSCRIPT_SCHEMA_VERSION, agent_id: 'a', created_at: 1 })
    const userMsg = JSON.stringify({ schema_version: TRANSCRIPT_SCHEMA_VERSION, seq: 1, role: 'user', content: 'do it', timestamp: 1 })
    const assistantMsg = JSON.stringify({
      schema_version: TRANSCRIPT_SCHEMA_VERSION, seq: 2, role: 'assistant', content: null, timestamp: 2,
      tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'read', arguments: '{}' } }],
    })
    const toolResult = JSON.stringify({
      schema_version: TRANSCRIPT_SCHEMA_VERSION, seq: 3, role: 'tool', content: 'result', timestamp: 3,
      tool_call_id: 'tc1', tool_name: 'read',
    })
    file.setContent(`${header}\n${userMsg}\n${assistantMsg}\n${toolResult}\n`)

    const reader = new TranscriptReader(handle as unknown as FileSystemFileHandle)
    const result = await reader.read()
    expect(result.messages).toHaveLength(3)
  })
})
