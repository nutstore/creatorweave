/**
 * WelcomeScreen - shown when no active conversation.
 *
 * Clean, centered layout with input box to start a conversation.
 */

import { useState } from 'react'
import { Send, FolderOpen, Sparkles } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'

interface WelcomeScreenProps {
  onStartConversation: (text: string) => void
}

export function WelcomeScreen({ onStartConversation }: WelcomeScreenProps) {
  const [input, setInput] = useState('')
  const { hasApiKey } = useSettingsStore()
  const { directoryHandle, setDirectoryHandle } = useAgentStore()
  const { conversations } = useConversationStore()

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    onStartConversation(text)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleSelectFolder = async () => {
    try {
      const handle = await selectFolderReadWrite()
      setDirectoryHandle(handle)
    } catch (error) {
      if (error instanceof Error && error.message === 'User cancelled') return
      console.error('Failed to select folder:', error)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-4">
      <div className="w-full max-w-xl">
        {/* Logo & Tagline */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
            <Sparkles className="h-6 w-6 text-primary-600" />
          </div>
          <h1 className="mb-2 text-2xl font-semibold text-neutral-900">BFOSA</h1>
          <p className="text-sm text-neutral-500">浏览器原生 AI 工作台</p>
        </div>

        {/* Input area */}
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? '输入消息开始对话...' : '请先在设置中配置 API Key'}
            rows={3}
            className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 pr-12 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-primary-300"
            disabled={!hasApiKey}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || !hasApiKey}
            className="absolute bottom-3 right-3 rounded-lg bg-primary-600 p-1.5 text-white hover:bg-primary-700 disabled:opacity-30"
            title="发送"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="mt-6 flex items-center justify-center gap-4">
          {!directoryHandle && (
            <button
              type="button"
              onClick={handleSelectFolder}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              打开本地文件夹
            </button>
          )}
        </div>

        {/* Recent conversations hint */}
        {conversations.length > 0 && (
          <p className="mt-8 text-center text-xs text-neutral-400">
            从左侧选择已有对话，或输入消息开始新对话
          </p>
        )}
      </div>
    </div>
  )
}
