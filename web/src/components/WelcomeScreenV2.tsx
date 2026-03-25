/**
 * WelcomeScreenV2 - Clean onboarding screen with drag-and-drop support
 */

import { useState, useCallback } from 'react'
import { Send, FolderOpen, Sparkles, Upload } from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { useT } from '@/i18n'

interface WelcomeScreenProps {
  onStartConversation: (text: string) => void
}

export function WelcomeScreenV2({ onStartConversation }: WelcomeScreenProps) {
  const [input, setInput] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [draggedFiles, setDraggedFiles] = useState<FileList | null>(null)
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

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      setDraggedFiles(files)
      const fileNames = Array.from(files)
        .map((f) => f.name)
        .slice(0, 3)
        .join(', ')
      const moreCount = files.length > 3 ? ` and ${files.length - 3} more` : ''
      setInput(`I've uploaded: ${fileNames}${moreCount}. Please help me analyze these files.`)
    }
  }, [])

  const getFileTypeIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'csv':
      case 'xlsx':
      case 'xls':
        return '📊'
      case 'pdf':
        return '📄'
      case 'doc':
      case 'docx':
        return '📝'
      case 'txt':
      case 'md':
        return '📃'
      case 'json':
        return '🗂️'
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return '🖼️'
      default:
        return '📁'
    }
  }

  return (
    <div
      className="flex h-full flex-col items-center justify-center bg-white px-4 dark:bg-neutral-950"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="w-full max-w-2xl">
        {/* Logo & Tagline */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50/80 shadow-sm">
            <Sparkles className="h-6 w-6 text-primary-600" />
          </div>
          <h1 className="mb-2 text-3xl font-semibold text-neutral-900 dark:text-neutral-100">{t('welcome.title')}</h1>
          <p className="text-base text-neutral-500 dark:text-neutral-400">{t('welcome.tagline')}</p>
        </div>

        {/* Input area with drag overlay */}
        <div className="relative mb-6">
          {/* Drag overlay */}
          {isDragging && (
            <div className="border-primary-400 absolute inset-0 z-10 -m-2 flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-primary-50/70">
              <Upload className="mb-4 h-12 w-12 text-primary-500" />
              <p className="text-lg font-medium text-primary-700">Drop files here</p>
              <p className="text-sm text-primary-600">Supports CSV, Excel, PDF, images, and more</p>
            </div>
          )}

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? t('welcome.placeholder') : t('welcome.placeholderNoKey')}
            aria-label="输入消息"
            rows={3}
            className="focus:border-primary-300 focus:ring-primary-300 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-5 py-4 pr-14 text-sm text-neutral-900 shadow-sm transition-all placeholder:text-neutral-400 focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:bg-neutral-800"
            disabled={!hasApiKey}
          />

          {/* Dropped files indicator */}
          {draggedFiles && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-neutral-200 bg-neutral-100 p-3 dark:border-neutral-700 dark:bg-neutral-900">
              <div className="mb-2 flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary-600" />
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
                  {draggedFiles.length} file{draggedFiles.length > 1 ? 's' : ''} ready
                </span>
                <button
                  type="button"
                  onClick={() => setDraggedFiles(null)}
                  className="ml-auto text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from(draggedFiles)
                  .slice(0, 5)
                  .map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <span>{getFileTypeIcon(file.name)}</span>
                      <span className="max-w-[100px] truncate">{file.name}</span>
                    </div>
                  ))}
                {draggedFiles.length > 5 && (
                  <div className="rounded-lg bg-neutral-200 px-2 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    +{draggedFiles.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim() || !hasApiKey}
            className="absolute bottom-4 right-4 rounded-xl bg-primary-600 p-2 text-white shadow-sm transition-colors hover:bg-primary-700 disabled:opacity-30 disabled:hover:bg-primary-600"
            title={t('welcome.send')}
          >
            <Send className="h-4 w-4" />
          </button>
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
            onClick={() => setInput('What can you help me with?')}
            disabled={!hasApiKey}
            className="flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-normal text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Sparkles className="h-4 w-4" />
            {t('welcome.viewCapabilities') || 'View Capabilities'}
          </button>
        </div>

        {/* Recent conversations hint */}
        {conversations.length > 0 && (
          <p className="mt-8 text-center text-xs text-neutral-400 dark:text-neutral-500">{t('welcome.recentHint')}</p>
        )}
      </div>
    </div>
  )
}
