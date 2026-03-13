/**
 * ConversationListPage - displays list of conversations with sync button.
 * Matches Host端 Sidebar styles for consistency.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, MessageSquare } from 'lucide-react'
import { ConversationList } from '@creatorweave/conversation'
import { useConversationStore } from '../store/conversation.store'

export function ConversationListPage() {
  const navigate = useNavigate()
  const { conversations, activeConversationId } = useConversationStore()

  // Request conversation sync when page loads
  useEffect(() => {
    const socket = (window as any).remoteSocket
    if (socket?.connected) {
      socket.emit('message', { type: 'sync:request' })
    }
  }, [])

  const handleSelectConversation = (id: string) => {
    navigate(`/chats/${id}`)
  }

  const handleRefresh = () => {
    const socket = (window as any).remoteSocket
    if (socket?.connected) {
      socket.emit('message', { type: 'sync:request', fullSync: true })
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 px-2 py-1.5 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <span className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
            对话列表
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
              title="刷新列表"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 custom-scrollbar overflow-y-auto px-1.5 py-1.5 max-w-lg mx-auto w-full">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-neutral-400">
            <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-xs">暂无会话</p>
            <p className="text-[10px] mt-1">等待 PC 端同步会话数据...</p>
          </div>
        ) : (
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            className="min-h-full"
          />
        )}
      </main>
    </div>
  )
}
