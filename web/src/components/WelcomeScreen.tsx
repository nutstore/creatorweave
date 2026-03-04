/**
 * WelcomeScreen - shown when no active conversation.
 *
 * Clean, centered layout with input box to start a conversation.
 * Phase 4: Added i18n support
 */

import { useState } from 'react'
import { Send, FolderOpen, Sparkles } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { useT } from '@/i18n'

interface WelcomeScreenProps {
  onStartConversation: (text: string) => void
}

export function WelcomeScreen({ onStartConversation }: WelcomeScreenProps) {
  const [input, setInput] = useState('')
  const { hasApiKey } = useSettingsStore()
  const { directoryHandle, setDirectoryHandle } = useAgentStore()
  const { conversations } = useConversationStore()
  const t = useT()

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
    <div className="flex h-full flex-col items-center justify-center bg-white px-4 dark:bg-neutral-950">
      <div className="w-full max-w-xl">
        {/* Logo & Tagline */}
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50">
            <Sparkles className="h-6 w-6 text-primary-600" />
          </div>
          <h1 className="mb-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{t('welcome.title')}</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{t('welcome.tagline')}</p>
        </div>

        {/* Input area */}
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? t('welcome.placeholder') : t('welcome.placeholderNoKey')}
            rows={3}
            className="focus:border-primary-300 focus:ring-primary-300 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 pr-12 text-sm text-neutral-900 placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-1 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:bg-neutral-800"
            disabled={!hasApiKey}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || !hasApiKey}
            className="absolute bottom-3 right-3 rounded-lg bg-primary-600 p-1.5 text-white hover:bg-primary-700 disabled:opacity-30"
            title={t('welcome.send')}
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
              className="flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-normal text-secondary transition-colors hover:bg-primary-50 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <FolderOpen className="h-[14px] w-[14px]" />
              {t('folderSelector.openFolder')}
            </button>
          )}
        </div>

        {/* Recent conversations hint */}
        {conversations.length > 0 && (
          <p className="mt-8 text-center text-xs text-neutral-400 dark:text-neutral-500">{t('welcome.recentHint')}</p>
        )}
      </div>
    </div>
  )
}
