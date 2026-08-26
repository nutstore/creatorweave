/**
 * SubAgent Transcript — OPFS-backed JSONL transcript storage.
 *
 * Each subagent stores its conversation transcript as a JSONL file in OPFS.
 * The format is append-only, one JSON object per line, with schema versioning.
 *
 * File layout: `.subagents/{agentId}/transcript.jsonl`
 *
 * @see weave-docs/design/subagent-prerequisite-for-llm-wiki.md §8.1
 */

import { SubagentError, SubagentErrorCode } from '@/agent/tools/tool-types'
import type { Message } from '@/agent/message-types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TRANSCRIPT_SCHEMA_VERSION = '1.0'
export const TRANSCRIPT_MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
export const TRANSCRIPT_DIR = '.subagents'

/** A single line in the transcript JSONL file. */
export interface TranscriptEntry {
  /** Schema version for migration support */
  schema_version: string
  /** Monotonic entry sequence number */
  seq: number
  /** Role of the message author */
  role: Message['role']
  /** Message content (text) */
  content: string | null
  /** Tool calls (assistant messages only) */
  tool_calls?: Message['toolCalls']
  /** Tool call ID (tool messages only) */
  tool_call_id?: Message['toolCallId']
  /** Tool name (tool messages only) */
  tool_name?: Message['name']
  /** Timestamp when the entry was recorded */
  timestamp: number
}

/** Metadata header stored as the first line of every transcript file. */
export interface TranscriptHeader {
  schema_version: string
  agent_id: string
  created_at: number
}

// ---------------------------------------------------------------------------
// TranscriptWriter — append-only JSONL writer
// ---------------------------------------------------------------------------

export class TranscriptWriter {
  private seq = 0
  private writable?: FileSystemWritableFileStream
  private byteCount = 0
  private closed = false

  constructor(
    private readonly fileHandle: FileSystemFileHandle,
    private readonly agentId: string,
  ) {}

  /** Open the file for appending and write the header line. */
  async open(): Promise<void> {
    this.writable = await this.fileHandle.createWritable({ keepExistingData: false })
    const header: TranscriptHeader = {
      schema_version: TRANSCRIPT_SCHEMA_VERSION,
      agent_id: this.agentId,
      created_at: Date.now(),
    }
    await this.writeLine(header)
  }

  /** Append a message as a transcript entry. */
  async append(message: Message): Promise<void> {
    if (this.closed) return
    const entry: TranscriptEntry = {
      schema_version: TRANSCRIPT_SCHEMA_VERSION,
      seq: ++this.seq,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      ...(message.toolCalls?.length ? { tool_calls: message.toolCalls } : {}),
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
      ...(message.name ? { tool_name: message.name } : {}),
    }
    await this.writeLine(entry)
  }

  /** Close the writer. Must be called when done. */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    await this.writable?.close()
    this.writable = undefined
  }

  /** Current approximate file size in bytes. */
  get size(): number {
    return this.byteCount
  }

  private async writeLine(obj: object): Promise<void> {
    const line = JSON.stringify(obj) + '\n'
    const bytes = new TextEncoder().encode(line)
    this.byteCount += bytes.byteLength
    await this.writable!.write(bytes)
  }
}

// ---------------------------------------------------------------------------
// TranscriptReader — read + validate + clean JSONL transcript
// ---------------------------------------------------------------------------

export class TranscriptReader {
  constructor(private readonly fileHandle: FileSystemFileHandle) {}

  /** Read all entries, validate, and clean incomplete message blocks. */
  async read(): Promise<{
    header: TranscriptHeader
    messages: Message[]
    entriesRecovered: number
    truncated: boolean
  }> {
    const file = await this.fileHandle.getFile()
    const text = await file.text()

    if (!text.trim()) {
      throw new SubagentError(SubagentErrorCode.TRANSCRIPT_CORRUPTED, 'transcript file is empty')
    }

    const lines = text.split('\n').filter((l) => l.trim())
    if (lines.length === 0) {
      throw new SubagentError(SubagentErrorCode.TRANSCRIPT_CORRUPTED, 'transcript has no valid lines')
    }

    // Parse header (first line)
    let header: TranscriptHeader
    try {
      header = JSON.parse(lines[0])
    } catch {
      throw new SubagentError(SubagentErrorCode.TRANSCRIPT_CORRUPTED, 'transcript header is not valid JSON')
    }

    if (!header.schema_version) {
      throw new SubagentError(SubagentErrorCode.TRANSCRIPT_CORRUPTED, 'transcript header missing schema_version')
    }

    // Check schema version compatibility
    if (header.schema_version !== TRANSCRIPT_SCHEMA_VERSION) {
      throw new SubagentError(
        SubagentErrorCode.TRANSCRIPT_CORRUPTED,
        `unsupported transcript schema version: ${header.schema_version} (expected ${TRANSCRIPT_SCHEMA_VERSION})`,
      )
    }

    // Parse entries
    const entries: TranscriptEntry[] = []
    for (let i = 1; i < lines.length; i++) {
      try {
        const entry = JSON.parse(lines[i]) as TranscriptEntry
        entries.push(entry)
      } catch {
        // Skip malformed lines (but don't fail the whole read)
      }
    }

    // Convert to Messages and clean incomplete tool call blocks
    const rawMessages = entries.map(entryToMessage)
    const messages = cleanIncompleteBlocks(rawMessages)

    return {
      header,
      messages,
      entriesRecovered: entries.length,
      truncated: entries.length < lines.length - 1,
    }
  }
}

// ---------------------------------------------------------------------------
// OPFS directory helpers
// ---------------------------------------------------------------------------

/** Get or create the `.subagents/{agentId}/` directory under a workspace OPFS root. */
export async function getTranscriptDir(
  workspaceDir: FileSystemDirectoryHandle,
  agentId: string,
): Promise<FileSystemDirectoryHandle> {
  const subagentsDir = await workspaceDir.getDirectoryHandle(TRANSCRIPT_DIR, { create: true })
  return subagentsDir.getDirectoryHandle(agentId, { create: true })
}

/** Get the transcript file handle (creates if missing). */
export async function getTranscriptFile(
  transcriptDir: FileSystemDirectoryHandle,
): Promise<FileSystemFileHandle> {
  return transcriptDir.getFileHandle('transcript.jsonl', { create: true })
}

/** Delete the entire transcript directory for a subagent. */
export async function deleteTranscriptDir(
  workspaceDir: FileSystemDirectoryHandle,
  agentId: string,
): Promise<void> {
  try {
    const subagentsDir = await workspaceDir.getDirectoryHandle(TRANSCRIPT_DIR)
    await subagentsDir.removeEntry(agentId, { recursive: true })
  } catch {
    // Directory may not exist — that's fine
  }
}

/** Check if a transcript file exists. */
export async function transcriptExists(
  transcriptDir: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    await transcriptDir.getFileHandle('transcript.jsonl')
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function entryToMessage(entry: TranscriptEntry): Message {
  return {
    id: `tr_${entry.seq}`,
    role: entry.role,
    content: entry.content,
    timestamp: entry.timestamp,
    ...(entry.tool_calls?.length ? { toolCalls: entry.tool_calls } : {}),
    ...(entry.tool_call_id ? { toolCallId: entry.tool_call_id } : {}),
    ...(entry.tool_name ? { name: entry.tool_name } : {}),
  }
}

/**
 * Remove incomplete tool call blocks: a tool_use (assistant with toolCalls)
 * without a corresponding tool_result (tool message with matching toolCallId).
 */
function cleanIncompleteBlocks(messages: Message[]): Message[] {
  if (messages.length === 0) return messages

  const result = [...messages]
  // Check from the end — if last assistant has toolCalls without matching tool results
  for (let i = result.length - 1; i >= 0; i--) {
    const msg = result[i]
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const toolIds = new Set(msg.toolCalls.map((tc) => tc.id))
      // Check if all tool results are present
      const resultsFound = new Set<string>()
      for (let j = i + 1; j < result.length; j++) {
        if (result[j].role === 'tool' && result[j].toolCallId) {
          resultsFound.add(result[j].toolCallId!)
        }
      }
      if (toolIds.size > 0 && ![...toolIds].every((id) => resultsFound.has(id))) {
        // Remove incomplete block: assistant + any partial tool results
        const toRemove = new Set<number>([i])
        for (let j = i + 1; j < result.length; j++) {
          if (result[j].role === 'tool' && result[j].toolCallId && toolIds.has(result[j].toolCallId!)) {
            toRemove.add(j)
          }
        }
        return result.filter((_, idx) => !toRemove.has(idx))
      }
    }
  }
  return result
}
