/**
 * ConversationDetailPage - displays messages of a conversation with load more.
 * Matches Host端 ConversationView styles for consistency.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ConversationDetail } from '@creatorweave/conversation'
import { useConversationStore } from '../store/conversation.store'
import type { Conversation, ConversationStatus } from '@creatorweave/conversation'

function mapAgentStatusToConversationStatus(
  status: 'idle' | 'thinking' | 'tool_calling' | 'error'
): ConversationStatus {
  switch (status) {
    case 'thinking':
      return 'streaming'
    case 'tool_calling':
      return 'tool_calling'
    case 'error':
      return 'error'
    default:
      return 'idle'
  }
}

export function ConversationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    conversations,
    setActiveConversation,
    thinkingContent,
    toolCalls,
  } = useConversationStore()
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [agentStatus, setAgentStatus] = useState<'idle' | 'thinking' | 'tool_calling' | 'error'>('idle')

  // Sync agent status from window (set by App.tsx)
  useEffect(() => {
    const updateStatus = () => {
      const status = (window as any).agentStatus
      if (status) {
        setAgentStatus(status)
      }
    }
    updateStatus()

    // Listen for status changes
    window.addEventListener('agentStatusChange', updateStatus)
    return () => window.removeEventListener('agentStatusChange', updateStatus)
  }, [])

  useEffect(() => {
    if (!id) return

    // Find conversation in store
    const conv = conversations.find(c => c.id === id)
    if (conv) {
      setConversation(conv)
      setActiveConversation(id)
    } else {
      // Request sync if not found
      const socket = (window as any).remoteSocket
      if (socket?.connected) {
        socket.emit('message', { type: 'sync:request', fullSync: true })
      }
    }
  }, [id, conversations, setActiveConversation])

  const handleLoadMore = () => {
    if (!conversation || !conversation.hasMore) return

    const nextPage = (conversation.currentPage || 1) + 1
    const socket = (window as any).remoteSocket
    if (socket?.connected) {
      socket.emit('message', {
        type: 'sync:page:request',
        conversationId: conversation.id,
        page: nextPage
      })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-2 py-1.5 sticky top-0 z-10">
        <div className="flex items-center gap-1 max-w-lg mx-auto">
          <button
            onClick={() => navigate('/chats')}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            对话详情
          </span>
          <span className="mx-1 text-neutral-300">·</span>
          <span className="text-xs text-neutral-600 truncate flex-1">
            {conversation?.title || '加载中...'}
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        <ConversationDetail
          conversation={conversation}
          status={mapAgentStatusToConversationStatus(agentStatus)}
          onLoadMore={conversation?.hasMore ? handleLoadMore : undefined}
          thinkingContent={thinkingContent}
          toolCalls={toolCalls}
          className="h-full"
        />
      </main>
    </div>
  )
}
