/**
 * Thread management utilities for conversation threading.
 * Provides thread creation, merging, deletion, navigation, and summarization.
 */

import type { Message, Thread } from './message-types'
import { generateId } from './message-types'

/**
 * Create a new thread from a message
 */
export function createThread(message: Message, title?: string): Thread {
  const now = Date.now()
  return {
    id: generateId(),
    rootMessageId: message.id,
    title: title || generateThreadTitle(message),
    messageCount: 1,
    createdAt: now,
    updatedAt: now,
    isCollapsed: false,
  }
}

/**
 * Generate a thread title from the first message content
 */
function generateThreadTitle(message: Message): string {
  const maxLength = 50
  let content = ''

  if (message.role === 'user' && message.content) {
    content = message.content.trim()
  } else if (message.role === 'assistant') {
    content = message.content?.trim() || message.reasoning?.trim() || 'Thread'
  } else if (message.role === 'tool') {
    content = `Tool: ${message.name || 'call'}`
  } else {
    content = 'Thread'
  }

  // Remove newlines and extra spaces
  content = content.replace(/\s+/g, ' ')

  // Truncate if too long
  if (content.length > maxLength) {
    return content.slice(0, maxLength - 3) + '...'
  }

  return content || 'Thread'
}

/**
 * Get all messages in a thread
 */
export function getThreadMessages(messages: Message[], threadId: string): Message[] {
  return messages.filter((m) => m.threadId === threadId)
}

/**
 * Build a thread hierarchy from messages
 * Returns a map of parent message IDs to their child messages
 */
export function buildThreadHierarchy(messages: Message[]): Map<string, Message[]> {
  const hierarchy = new Map<string, Message[]>()

  for (const message of messages) {
    if (message.parentMessageId) {
      const siblings = hierarchy.get(message.parentMessageId) || []
      siblings.push(message)
      hierarchy.set(message.parentMessageId, siblings)
    }
  }

  return hierarchy
}

/**
 * Get thread statistics
 */
export function getThreadStats(
  messages: Message[],
  threadId: string
): {
  totalMessages: number
  userMessages: number
  assistantMessages: number
  toolMessages: number
  totalTokens: number
} {
  const threadMessages = getThreadMessages(messages, threadId)

  const stats = {
    totalMessages: threadMessages.length,
    userMessages: 0,
    assistantMessages: 0,
    toolMessages: 0,
    totalTokens: 0,
  }

  for (const message of threadMessages) {
    if (message.role === 'user') stats.userMessages++
    else if (message.role === 'assistant') stats.assistantMessages++
    else if (message.role === 'tool') stats.toolMessages++

    if (message.usage) {
      stats.totalTokens += message.usage.totalTokens
    }
  }

  return stats
}

/**
 * Merge two threads together
 * Moves all messages from sourceThread to targetThread
 */
export function mergeThreads(
  messages: Message[],
  sourceThreadId: string,
  targetThreadId: string
): Message[] {
  return messages.map((message) => {
    if (message.threadId === sourceThreadId) {
      return { ...message, threadId: targetThreadId }
    }
    return message
  })
}

/**
 * Delete a thread (remove threadId from all messages in thread)
 */
export function deleteThread(messages: Message[], threadId: string): Message[] {
  return messages.map((message) => {
    if (message.threadId === threadId) {
      const rest = { ...message }
      delete rest.threadId
      delete rest.parentMessageId
      return rest
    }
    return message
  })
}

/**
 * Navigate to next thread in conversation
 */
export function getNextThread(messages: Message[], currentThreadId?: string): string | null {
  const threads = new Set(messages.map((m) => m.threadId).filter(Boolean) as string[])
  const threadArray = Array.from(threads)

  if (threadArray.length === 0) return null

  if (!currentThreadId) {
    return threadArray[0]
  }

  const currentIndex = threadArray.indexOf(currentThreadId)
  if (currentIndex === -1 || currentIndex === threadArray.length - 1) {
    return threadArray[0] // Wrap to beginning
  }

  return threadArray[currentIndex + 1]
}

/**
 * Navigate to previous thread in conversation
 */
export function getPreviousThread(messages: Message[], currentThreadId?: string): string | null {
  const threads = new Set(messages.map((m) => m.threadId).filter(Boolean) as string[])
  const threadArray = Array.from(threads)

  if (threadArray.length === 0) return null

  if (!currentThreadId) {
    return threadArray[threadArray.length - 1]
  }

  const currentIndex = threadArray.indexOf(currentThreadId)
  if (currentIndex === -1 || currentIndex === 0) {
    return threadArray[threadArray.length - 1] // Wrap to end
  }

  return threadArray[currentIndex - 1]
}

/**
 * Generate a thread summary for long conversations
 * This is a simple summary based on message content
 * For AI-powered summaries, integrate with your LLM provider
 */
export function generateThreadSummary(
  messages: Message[],
  threadId: string,
  maxLength: number = 200
): string {
  const threadMessages = getThreadMessages(messages, threadId)

  // Get user and assistant messages for summary
  const relevantMessages = threadMessages.filter(
    (m) => m.role === 'user' || (m.role === 'assistant' && m.content)
  )

  if (relevantMessages.length === 0) {
    return 'Empty thread'
  }

  // Build summary from first user message and last assistant message
  const firstUserMsg = relevantMessages.find((m) => m.role === 'user')
  const lastAssistantMsg = [...relevantMessages].reverse().find((m) => m.role === 'assistant')

  let summary = ''

  if (firstUserMsg?.content) {
    summary += `Started: ${firstUserMsg.content.slice(0, 80)}`
  }

  if (lastAssistantMsg?.content) {
    if (summary) summary += '\n'
    summary += `Latest: ${lastAssistantMsg.content.slice(0, 80)}`
  }

  // Truncate if too long
  if (summary.length > maxLength) {
    summary = summary.slice(0, maxLength - 3) + '...'
  }

  return summary || 'Thread summary'
}

/**
 * Fork a thread at a specific message
 * Creates a new thread branch from the specified message
 */
export function forkThread(
  messages: Message[],
  messageId: string,
  _newThreadTitle?: string
): { messages: Message[]; newThreadId: string } {
  const message = messages.find((m) => m.id === messageId)
  if (!message) {
    throw new Error(`Message ${messageId} not found`)
  }

  const newThreadId = generateId()
  const originalThreadId = message.threadId

  // Find all messages that come after this message in the same thread
  const messageIndex = messages.findIndex((m) => m.id === messageId)
  const messagesToUpdate = messages
    .slice(messageIndex)
    .filter((m) => m.threadId === originalThreadId)

  // Update messages to belong to new thread
  const updatedMessages = messages.map((m) => {
    if (messagesToUpdate.some((msg) => msg.id === m.id)) {
      return {
        ...m,
        threadId: newThreadId,
        parentMessageId: m.id === messageId ? undefined : m.parentMessageId,
      }
    }
    return m
  })

  return {
    messages: updatedMessages,
    newThreadId,
  }
}

/**
 * Get thread path (breadcrumb) for navigation
 */
export function getThreadPath(messages: Message[], threadId: string): Message[] {
  const threadMessages = getThreadMessages(messages, threadId)
  const path: Message[] = []

  // Build path by following parentMessageId
  let currentMessage = threadMessages.find((m) => !m.parentMessageId) // Root message

  while (currentMessage) {
    path.push(currentMessage)
    const nextMessage = threadMessages.find((m) => m.parentMessageId === currentMessage!.id)
    if (nextMessage) {
      currentMessage = nextMessage
    } else {
      break
    }
  }

  return path
}
