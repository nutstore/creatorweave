/**
 * Conversation Export Service
 *
 * Exports conversation records in multiple formats:
 * - JSON: structured data, suitable for backup and re-import
 * - Markdown: human-readable, suitable for sharing and reading
 * - HTML: styled document, suitable for printing and archiving
 *
 * @module conversation-export
 */

import { saveAs } from 'file-saver'
import type { Conversation, Message } from '@/agent/message-types'

// ============================================================================
// Types
// ============================================================================

export type ConversationExportFormat = 'json' | 'markdown' | 'html'

export interface ConversationExportOptions {
  /** Export format */
  format: ConversationExportFormat
  /** Whether to include tool call details */
  includeToolCalls?: boolean
  /** Whether to include reasoning content */
  includeReasoning?: boolean
  /** Whether to include token usage info */
  includeUsage?: boolean
  /** Whether to include system messages */
  includeSystemMessages?: boolean
  /** Custom filename (without extension) */
  filename?: string
  /** Add timestamp to filename */
  addTimestamp?: boolean
  /** Export progress callback */
  onProgress?: (progress: number, status: string) => void
}

export interface ConversationExportResult {
  success: boolean
  filename: string
  size: number
  format: ConversationExportFormat
  messageCount: number
  error?: string
}

/** Serializable representation of a conversation for JSON export */
export interface ConversationExportData {
  /** Export metadata */
  meta: {
    exportedAt: string
    format: string
    version: string
  }
  /** Conversation info */
  conversation: {
    id: string
    title: string
    createdAt: string
    updatedAt: string
  }
  /** Filtered messages */
  messages: Array<{
    id: string
    role: string
    content: string | null
    reasoning?: string | null
    timestamp: string
    toolCalls?: Message['toolCalls']
    toolCallId?: string
    name?: string
    usage?: Message['usage']
  }>
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Export a conversation to the specified format and trigger download.
 */
export async function exportConversation(
  conversation: Conversation,
  options: ConversationExportOptions,
): Promise<ConversationExportResult> {
  const {
    format,
    includeToolCalls = true,
    includeReasoning = true,
    includeUsage = false,
    includeSystemMessages = false,
    filename,
    addTimestamp = true,
    onProgress,
  } = options

  try {
    onProgress?.(10, 'Preparing messages...')

    // Filter and normalize messages
    const messages = filterMessages(conversation.messages, {
      includeToolCalls,
      includeSystemMessages,
    })

    if (messages.length === 0) {
      return {
        success: false,
        filename: '',
        size: 0,
        format,
        messageCount: 0,
        error: 'No messages to export',
      }
    }

    onProgress?.(30, `Generating ${format.toUpperCase()}...`)

    const baseName =
      filename || conversation.title.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'conversation'

    let blob: Blob
    let extension: string

    switch (format) {
      case 'json':
        blob = generateJSON(conversation, messages, {
          includeToolCalls,
          includeReasoning,
          includeUsage,
        })
        extension = 'json'
        break
      case 'markdown':
        blob = generateMarkdown(conversation, messages, {
          includeToolCalls,
          includeReasoning,
        })
        extension = 'md'
        break
      case 'html':
        blob = generateHTML(conversation, messages, {
          includeToolCalls,
          includeReasoning,
        })
        extension = 'html'
        break
      default:
        throw new Error(`Unsupported format: ${format}`)
    }

    onProgress?.(80, 'Saving file...')

    const finalFilename = buildFilename(baseName, extension, addTimestamp)
    saveAs(blob, finalFilename)

    onProgress?.(100, 'Export complete')

    return {
      success: true,
      filename: finalFilename,
      size: blob.size,
      format,
      messageCount: messages.length,
    }
  } catch (error) {
    return {
      success: false,
      filename: '',
      size: 0,
      format,
      messageCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error during export',
    }
  }
}

// ============================================================================
// Message Filtering
// ============================================================================

interface FilterOptions {
  includeToolCalls: boolean
  includeSystemMessages: boolean
}

function filterMessages(messages: Message[], options: FilterOptions): Message[] {
  return messages.filter((msg) => {
    // Skip system messages unless requested
    if (msg.role === 'system' && !options.includeSystemMessages) return false
    // Skip tool result messages if tool calls are excluded
    if (msg.role === 'tool' && !options.includeToolCalls) return false
    return true
  })
}

// ============================================================================
// JSON Export
// ============================================================================

function generateJSON(
  conversation: Conversation,
  messages: Message[],
  options: { includeToolCalls: boolean; includeReasoning: boolean; includeUsage: boolean },
): Blob {
  const data: ConversationExportData = {
    meta: {
      exportedAt: new Date().toISOString(),
      format: 'creatorweave-conversation',
      version: '1.0.0',
    },
    conversation: {
      id: conversation.id,
      title: conversation.title,
      createdAt: new Date(conversation.createdAt).toISOString(),
      updatedAt: new Date(conversation.updatedAt).toISOString(),
    },
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      reasoning: options.includeReasoning ? msg.reasoning : undefined,
      timestamp: new Date(msg.timestamp).toISOString(),
      toolCalls: options.includeToolCalls ? msg.toolCalls : undefined,
      toolCallId: options.includeToolCalls ? msg.toolCallId : undefined,
      name: options.includeToolCalls ? msg.name : undefined,
      usage: options.includeUsage ? msg.usage : undefined,
    })),
  }

  const json = JSON.stringify(data, null, 2)
  return new Blob([json], { type: 'application/json;charset=utf-8' })
}

// ============================================================================
// Markdown Export
// ============================================================================

function generateMarkdown(
  conversation: Conversation,
  messages: Message[],
  options: { includeToolCalls: boolean; includeReasoning: boolean },
): Blob {
  const lines: string[] = []

  // Title
  lines.push(`# ${conversation.title}`)
  lines.push('')
  lines.push(
    `> Exported on ${new Date().toLocaleString()} | Created on ${new Date(conversation.createdAt).toLocaleString()}`,
  )
  lines.push('')
  lines.push('---')
  lines.push('')

  for (const msg of messages) {
    const time = new Date(msg.timestamp).toLocaleString()

    switch (msg.role) {
      case 'user':
        lines.push(`### 👤 User — ${time}`)
        lines.push('')
        lines.push(msg.content || '')
        lines.push('')
        break

      case 'assistant': {
        lines.push(`### 🤖 Assistant — ${time}`)
        lines.push('')

        // Reasoning
        if (options.includeReasoning && msg.reasoning) {
          lines.push('<details>')
          lines.push('<summary>💭 Reasoning</summary>')
          lines.push('')
          lines.push(msg.reasoning)
          lines.push('')
          lines.push('</details>')
          lines.push('')
        }

        // Content
        if (msg.content) {
          lines.push(msg.content)
          lines.push('')
        }

        // Tool calls
        if (options.includeToolCalls && msg.toolCalls && msg.toolCalls.length > 0) {
          lines.push('<details>')
          lines.push(`<summary>🔧 Tool Calls (${msg.toolCalls.length})</summary>`)
          lines.push('')
          for (const tc of msg.toolCalls) {
            lines.push(`**${tc.function.name}**`)
            lines.push('```json')
            lines.push(formatToolArgs(tc.function.arguments))
            lines.push('```')
            lines.push('')
          }
          lines.push('</details>')
          lines.push('')
        }

        lines.push('---')
        lines.push('')
        break
      }

      case 'tool':
        if (options.includeToolCalls) {
          lines.push(`### 🔧 Tool: ${msg.name || 'unknown'} — ${time}`)
          lines.push('')
          lines.push('```')
          lines.push(truncateContent(msg.content || '', 2000))
          lines.push('```')
          lines.push('')
          lines.push('---')
          lines.push('')
        }
        break

      case 'system':
        lines.push(`### ⚙️ System — ${time}`)
        lines.push('')
        lines.push(msg.content || '')
        lines.push('')
        break
    }
  }

  const md = lines.join('\n')
  return new Blob([md], { type: 'text/markdown;charset=utf-8' })
}

// ============================================================================
// HTML Export
// ============================================================================

function generateHTML(
  conversation: Conversation,
  messages: Message[],
  options: { includeToolCalls: boolean; includeReasoning: boolean },
): Blob {
  const roleLabels: Record<string, { icon: string; label: string; color: string }> = {
    user: { icon: '👤', label: 'User', color: '#3b82f6' },
    assistant: { icon: '🤖', label: 'Assistant', color: '#8b5cf6' },
    tool: { icon: '🔧', label: 'Tool', color: '#f59e0b' },
    system: { icon: '⚙️', label: 'System', color: '#6b7280' },
  }

  const messageParts = messages.map((msg) => {
    const role = roleLabels[msg.role] || roleLabels.system
    const time = new Date(msg.timestamp).toLocaleString()

    let body = ''

    // Reasoning section
    if (options.includeReasoning && msg.role === 'assistant' && msg.reasoning) {
      body += `
        <details class="reasoning">
          <summary>💭 Reasoning</summary>
          <div class="reasoning-content">${escapeHtml(msg.reasoning)}</div>
        </details>`
    }

    // Content
    if (msg.content) {
      body += `<div class="message-content">${escapeHtml(msg.content)}</div>`
    }

    // Tool calls
    if (options.includeToolCalls && msg.role === 'assistant' && msg.toolCalls?.length) {
      body += `
        <details class="tool-calls">
          <summary>🔧 Tool Calls (${msg.toolCalls.length})</summary>
          ${msg.toolCalls
            .map(
              (tc) => `
            <div class="tool-call">
              <div class="tool-name">${escapeHtml(tc.function.name)}</div>
              <pre><code>${escapeHtml(formatToolArgs(tc.function.arguments))}</code></pre>
            </div>`,
            )
            .join('')}
        </details>`
    }

    // Tool result
    if (options.includeToolCalls && msg.role === 'tool') {
      body += `<pre class="tool-result"><code>${escapeHtml(truncateContent(msg.content || '', 2000))}</code></pre>`
    }

    return `
      <div class="message message-${msg.role}">
        <div class="message-header">
          <span class="role-icon">${role.icon}</span>
          <span class="role-label" style="color: ${role.color}">${role.label}</span>
          <span class="message-time">${time}</span>
        </div>
        ${body}
      </div>`
  })

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(conversation.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.6;
      padding: 2rem;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 2px solid #e2e8f0;
    }
    .header h1 { font-size: 1.5rem; color: #0f172a; margin-bottom: 0.5rem; }
    .header .meta { font-size: 0.8rem; color: #94a3b8; }
    .message {
      background: white;
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .message-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      font-size: 0.8rem;
    }
    .role-icon { font-size: 1rem; }
    .role-label { font-weight: 600; }
    .message-time { color: #94a3b8; margin-left: auto; }
    .message-content {
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 0.9rem;
    }
    .message-user { border-left: 3px solid #3b82f6; }
    .message-assistant { border-left: 3px solid #8b5cf6; }
    .message-tool { border-left: 3px solid #f59e0b; background: #fffbeb; }
    .message-system { border-left: 3px solid #6b7280; background: #f1f5f9; }
    details {
      margin-top: 0.5rem;
      background: #f8fafc;
      border-radius: 8px;
      padding: 0.5rem 0.75rem;
    }
    details summary {
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 500;
      color: #64748b;
    }
    details pre, details code {
      font-size: 0.8rem;
      background: #1e293b;
      color: #e2e8f0;
      padding: 0.75rem;
      border-radius: 6px;
      overflow-x: auto;
      margin-top: 0.5rem;
    }
    .tool-call { margin-top: 0.5rem; }
    .tool-name { font-weight: 600; font-size: 0.85rem; color: #334155; }
    .tool-result {
      font-size: 0.8rem;
      background: #1e293b;
      color: #e2e8f0;
      padding: 0.75rem;
      border-radius: 6px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .reasoning-content { white-space: pre-wrap; font-size: 0.85rem; color: #475569; }
    @media print {
      body { padding: 0; max-width: none; }
      .message { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(conversation.title)}</h1>
    <div class="meta">
      Created: ${new Date(conversation.createdAt).toLocaleString()} |
      Messages: ${messages.length} |
      Exported: ${new Date().toLocaleString()}
    </div>
  </div>
  ${messageParts.join('')}
</body>
</html>`

  return new Blob([html], { type: 'text/html;charset=utf-8' })
}

// ============================================================================
// Utilities
// ============================================================================

function buildFilename(base: string, extension: string, addTimestamp: boolean): string {
  const safeName = base.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, '_')
  const timestamp = addTimestamp ? `_${Date.now()}` : ''
  return `${safeName}${timestamp}.${extension}`
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatToolArgs(args: string | undefined | unknown): string {
  if (typeof args === 'string') {
    try {
      return JSON.stringify(JSON.parse(args), null, 2)
    } catch {
      return args
    }
  }
  if (args != null) return JSON.stringify(args, null, 2)
  return ''
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content
  return content.slice(0, maxLength) + '\n... (truncated)'
}
