/**
 * WelcomeScreenV2 - Clean onboarding screen with rich text input
 *
 * Uses AgentRichInput (same as workspace bottom input) for consistent UX.
 * File attachments are stored in useAssetStore and carried over when
 * the conversation starts.
 */

import { useState, useCallback } from 'react'
import { Send, FolderOpen, Sparkles } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { useT } from '@/i18n'
import { AgentRichInput, type AgentRichInputValue, type AgentInfo } from './agent/AgentRichInput'
import type { FileMentionItem } from './agent/FileMentionExtension'

interface WelcomeScreenProps {
  onStartConversation: (text: string) => void
}

export function WelcomeScreenV2({ onStartConversation }: WelcomeScreenProps) {
  const [inputValue, setInputValue] = useState('')
  const [editorKey, setEditorKey] = useState(0)
  const [quickActionText, setQuickActionText] = useState<string | undefined>(undefined)
  const hasApiKey = useSettingsStore((s) => s.hasApiKey)
  const directoryHandle = useAgentStore((s) => s.directoryHandle)
  const setDirectoryHandle = useAgentStore((s) => s.setDirectoryHandle)
  const hasConversations = useConversationStore((s) => s.conversations.length > 0)
  const t = useT()
  const isInputDisabled = !hasApiKey

  const handleSubmit = useCallback(() => {
    const text = inputValue.trim()
    if (!text) return
    // Do NOT increment resetToken here — that would trigger clearAll() on
    // pending assets. Since the welcome screen unmounts immediately after
    // starting a conversation, the assets are preserved in useAssetStore
    // and picked up by useInitialMessage in ConversationView.
    onStartConversation(text)
    setInputValue('')
  }, [inputValue, onStartConversation])

  const handleSelectFolder = async () => {
    try {
      const handle = await selectFolderReadWrite()
      setDirectoryHandle(handle)
    } catch (error) {
      if (error instanceof Error && error.message === 'User cancelled') return
      console.error('Failed to select folder:', error)
    }
  }

  const handleInputChange = useCallback(
    ({ text }: AgentRichInputValue) => {
      setInputValue(text)
    },
    [],
  )

  // Inject quick action text by remounting editor with initialText
  const handleQuickAction = useCallback((text: string) => {
    setQuickActionText(text)
    setInputValue(text)
    // Bump key to remount editor with new initialText
    setEditorKey((k) => k + 1)
  }, [])

  // Clear quickActionText after it's been consumed by the editor
  const handleDraftRestored = useCallback(() => {
    setQuickActionText(undefined)
  }, [])

  // Minimal file search handler — returns empty for welcome screen
  // (file search requires an active conversation workspace)
  const handleSearchFiles = useCallback(
    async (_query: string): Promise<FileMentionItem[]> => [],
    [],
  )

  return (
    <div className="flex h-full flex-col items-center justify-center bg-white px-4 dark:bg-neutral-950">
      <div className="w-full max-w-2xl">
        {/* Logo & Tagline */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50/80 shadow-sm">
            <Sparkles className="h-6 w-6 text-primary-600" />
          </div>
          <h1 className="mb-2 text-3xl font-semibold text-neutral-900 dark:text-neutral-100">
            {t('welcome.title')}
          </h1>
          <p className="text-base text-neutral-500 dark:text-neutral-400">{t('welcome.tagline')}</p>
        </div>

        {/* Rich text input area */}
        <div className="relative mb-6">
          <AgentRichInput
            key={editorKey}
            placeholder={
              hasApiKey ? t('welcome.placeholder') : t('welcome.placeholderNoKey')
            }
            ariaLabel={t('conversation.input.ariaLabel')}
            disabled={isInputDisabled}
            initialText={quickActionText}
            onDraftRestored={handleDraftRestored}
            agents={[]}
            onSearchFiles={handleSearchFiles}
            activeAgentId={null}
            allAgents={[]}
            onSetActiveAgent={async () => {}}
            onCreateAgent={async (_id: string): Promise<AgentInfo | null> => null}
            onDeleteAgent={async () => false}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!inputValue.trim() || !hasApiKey}
            className="absolute bottom-4 right-4 z-10 rounded-xl bg-primary-600 p-2 text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-30 disabled:hover:bg-primary-600"
            title={t('welcome.send')}
          >
            <Send className="h-4 w-4" />
          </button>

          {isInputDisabled && (
            <p className="mt-2 px-1 text-xs text-neutral-500 dark:text-neutral-400">
              {t('welcome.apiKeyRequiredHint')}
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center justify-center gap-3">
          {!directoryHandle && (
            <button
              type="button"
              onClick={handleSelectFolder}
              className="flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-normal text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <FolderOpen className="h-4 w-4" />
              {t('folderSelector.openFolder')}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleQuickAction('What can you help me with?')}
            disabled={!hasApiKey}
            className="flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-normal text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Sparkles className="h-4 w-4" />
            {t('welcome.viewCapabilities')}
          </button>
        </div>

        {/* Recent conversations hint */}
        {hasConversations && (
          <p className="mt-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
            {t('welcome.recentHint')}
          </p>
        )}

        {/* Keyboard shortcut hint */}
        <p className="mt-4 text-center text-[11px] text-neutral-400 dark:text-neutral-500">
          <kbd className="rounded border border-neutral-200 bg-neutral-100 px-1 py-0.5 font-mono text-[10px] dark:border-neutral-700 dark:bg-neutral-800">
            {typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
              ? '⌘'
              : 'Ctrl+'}
            K
          </kbd>{' '}
          {typeof navigator !== 'undefined' && /zh/i.test(navigator.language)
            ? '打开命令面板'
            : 'Open command palette'}
        </p>
      </div>
    </div>
  )
}
