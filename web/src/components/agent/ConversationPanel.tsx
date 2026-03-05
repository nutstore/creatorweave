/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ConversationPanel - Enhanced conversation display with thread support.
 *
 * Features:
 * - Collapsible thread views
 * - Thread count indicators
 * - Message metadata display (timestamp, tool calls)
 * - Thread branching (forking threads)
 * - Quick navigation between threads
 */

import { useState, useMemo } from 'react'
import {
  MessageSquare,
  ChevronDown,
  ChevronRight,
  GitBranch,
  MessageSquarePlus,
} from 'lucide-react'
import { useConversationStore } from '@/store/conversation.store'
import type { Message } from '@/agent/message-types'
import { getThreadStats } from '@/agent/thread-utils'
import { MessageBubble } from './MessageBubble'
import { AssistantTurnBubble } from './AssistantTurnBubble'
import { groupMessagesIntoTurns } from './group-messages'
import { toast } from 'sonner'
import type { ConversationStatus } from '@/agent/message-types'

interface ConversationPanelProps {
  /** Current conversation ID */
  conversationId: string
  /** Tool results map for displaying tool outputs */
  toolResults?: Map<string, string>
  /** Whether agent is processing */
  isProcessing?: boolean
  /** Current conversation status */
  status?: ConversationStatus
  /** Streaming state for last message */
  streamingState?: {
    reasoning?: boolean
    content?: boolean
  }
  /** Streaming content message */
  streamingContent?: {
    reasoning?: string
    content?: string
  }
  /** Current tool call */
  currentToolCall?: any
  /** Streaming tool arguments */
  streamingToolArgs?: string
}

export function ConversationPanel({
  conversationId,
  toolResults = new Map(),
  isProcessing = false,
  status = 'idle',
  streamingState,
  streamingContent,
  currentToolCall,
  streamingToolArgs,
}: ConversationPanelProps) {
  const conversations = useConversationStore((s) => s.conversations)
  const conversation = conversations.find((c) => c.id === conversationId)

  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(new Set())
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

  // Thread management actions
  const createThread = useConversationStore((s) => s.createThread)
  const forkThread = useConversationStore((s) => s.forkThread)
  const navigateToNextThread = useConversationStore((s) => s.navigateToNextThread)
  const navigateToPreviousThread = useConversationStore((s) => s.navigateToPreviousThread)
  const setActiveThread = useConversationStore((s) => s.setActiveThread)

  // Group messages into threads
  const threadGroups = useMemo(() => {
    if (!conversation) return []

    const threads = new Map<string, Message[]>()

    // Group messages by threadId
    for (const message of conversation.messages) {
      const threadId = message.threadId || 'main'
      if (!threads.has(threadId)) {
        threads.set(threadId, [])
      }
      threads.get(threadId)!.push(message)
    }

    // Sort messages within each thread by timestamp
    for (const [threadId, messages] of threads.entries()) {
      threads.set(
        threadId,
        messages.sort((a, b) => a.timestamp - b.timestamp)
      )
    }

    // Convert to array and sort by thread creation time
    return Array.from(threads.entries()).map(([threadId, messages]) => ({
      threadId,
      messages,
      isMain: threadId === 'main',
      rootMessage: messages[0],
    }))
  }, [conversation])

  // Get all unique thread IDs
  const threadIds = useMemo(() => {
    if (!conversation) return []
    const ids = new Set(conversation.messages.map((m) => m.threadId).filter(Boolean) as string[])
    return Array.from(ids)
  }, [conversation])

  // Toggle thread collapse
  const toggleThread = (threadId: string) => {
    setCollapsedThreads((prev) => {
      const next = new Set(prev)
      if (next.has(threadId)) {
        next.delete(threadId)
      } else {
        next.add(threadId)
      }
      return next
    })
  }

  // Create thread from message
  const handleCreateThread = (messageId: string) => {
    createThread(conversationId, messageId)
    toast.success('线程创建成功')
  }

  // Fork thread at message
  const handleForkThread = (messageId: string) => {
    forkThread(conversationId, messageId)
  }

  // Navigate threads
  const handleNextThread = () => {
    const nextThreadId = navigateToNextThread(conversationId)
    if (nextThreadId) {
      setActiveThreadId(nextThreadId)
      setActiveThread(conversationId, nextThreadId)
    }
  }

  const handlePreviousThread = () => {
    const prevThreadId = navigateToPreviousThread(conversationId)
    if (prevThreadId) {
      setActiveThreadId(prevThreadId)
      setActiveThread(conversationId, prevThreadId)
    }
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-neutral-400">
          <MessageSquare className="mx-auto mb-2 h-8 w-8" />
          <p className="text-sm">加载对话中...</p>
        </div>
      </div>
    )
  }

  const isCollapsed = (threadId: string) => collapsedThreads.has(threadId)
  const turns = groupMessagesIntoTurns(conversation.messages)
  const hasAssistantTurn = turns.some((t) => t.type === 'assistant')

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      {/* Thread navigation bar */}
      {threadIds.length > 0 && (
        <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mx-auto flex max-w-3xl items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              <GitBranch className="h-4 w-4" />
              <span>
                {threadIds.length} 个线程
                {activeThreadId && ` · 当前: ${activeThreadId.slice(0, 8)}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePreviousThread}
                className="rounded-lg px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
                title="上一个线程"
              >
                上一个
              </button>
              <button
                type="button"
                onClick={handleNextThread}
                className="rounded-lg px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
                title="下一个线程"
              >
                下一个
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="px-4 py-4">
          {conversation.messages.length === 0 && !isProcessing && (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-neutral-400">
                <MessageSquare className="mx-auto mb-2 h-8 w-8" />
                <p className="text-sm">输入消息开始对话</p>
              </div>
            </div>
          )}

          <div className="mx-auto max-w-3xl space-y-4">
            {/* Render thread groups */}
            {threadGroups.map(({ threadId, isMain, rootMessage }) => {
              const collapsed = isCollapsed(threadId)
              const stats = getThreadStats(conversation.messages, threadId)

              return (
                <div key={threadId} className="relative">
                  {/* Thread header */}
                  {!isMain && (
                    <div
                      className="mb-2 flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-900"
                      onClick={() => toggleThread(threadId)}
                    >
                      <button
                        type="button"
                        className="flex items-center gap-1 text-sm font-medium text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
                      >
                        {collapsed ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        <span>{rootMessage?.content?.slice(0, 30) || 'Thread'}</span>
                          <span className="text-xs text-neutral-500 dark:text-neutral-400">
                          ({stats.totalMessages} 条消息)
                        </span>
                      </button>

                      {/* Thread actions */}
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleCreateThread(rootMessage!.id)
                          }}
                          className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                          title="创建线程"
                        >
                          <MessageSquarePlus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleForkThread(rootMessage!.id)
                          }}
                          className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                          title="分支线程"
                        >
                          <GitBranch className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Thread messages */}
                  {!collapsed && (
                    <div
                      className={`space-y-4 ${!isMain ? 'ml-4 border-l-2 border-neutral-200 pl-4 dark:border-neutral-700' : ''}`}
                    >
                      {turns
                        .filter((turn) => {
                          if (turn.type === 'user') {
                            return (turn.message.threadId || 'main') === threadId
                          }
                          const assistantThreadId = turn.messages[0]?.threadId || 'main'
                          return assistantThreadId === threadId
                        })
                        .map((turn, idx, filteredTurns) =>
                          turn.type === 'user' ? (
                            <MessageBubble key={turn.message.id} message={turn.message} />
                          ) : (
                            <AssistantTurnBubble
                              key={turn.messages[0].id}
                              turn={turn}
                              toolResults={toolResults}
                              isProcessing={isProcessing}
                              isWaiting={false}
                              streamingState={
                                isProcessing && idx === filteredTurns.length - 1
                                  ? streamingState
                                  : undefined
                              }
                              streamingContent={
                                isProcessing && idx === filteredTurns.length - 1
                                  ? streamingContent
                                  : undefined
                              }
                              currentToolCall={
                                isProcessing &&
                                idx === filteredTurns.length - 1 &&
                                status === 'tool_calling'
                                  ? currentToolCall
                                  : undefined
                              }
                              streamingToolArgs={
                                isProcessing &&
                                idx === filteredTurns.length - 1 &&
                                status === 'tool_calling'
                                  ? streamingToolArgs
                                  : undefined
                              }
                              runtimeToolCalls={
                                isProcessing && idx === filteredTurns.length - 1
                                  ? conversation.draftAssistant?.toolCalls
                                  : undefined
                              }
                              runtimeSteps={
                                isProcessing && idx === filteredTurns.length - 1
                                  ? conversation.draftAssistant?.steps
                                  : undefined
                              }
                            />
                          )
                        )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Draft assistant turn while streaming before first assistant message commits */}
            {isProcessing && !hasAssistantTurn && (
              <AssistantTurnBubble
                key="draft-assistant-threaded"
                turn={{
                  type: 'assistant',
                  messages: [],
                  timestamp: Date.now(),
                  totalUsage: null,
                }}
                toolResults={toolResults}
                isProcessing={true}
                isWaiting={status === 'pending'}
                streamingState={streamingState}
                streamingContent={streamingContent}
                currentToolCall={status === 'tool_calling' ? currentToolCall : undefined}
                streamingToolArgs={status === 'tool_calling' ? streamingToolArgs : undefined}
                runtimeToolCalls={conversation.draftAssistant?.toolCalls}
                runtimeSteps={conversation.draftAssistant?.steps}
              />
            )}

            {/* Pending indicator */}
            {isProcessing && status === 'pending' && !hasAssistantTurn && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="inline-block rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500 shadow-sm">
                  <span className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-primary-500"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-primary-500"
                      style={{ animationDelay: '160ms' }}
                    />
                    <span
                      className="h-2 w-2 animate-bounce rounded-full bg-primary-500"
                      style={{ animationDelay: '320ms' }}
                    />
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
