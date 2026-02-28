/**
 * WelcomeScreenV2 - Scene-based guided onboarding
 *
 * Shows different user personas and capabilities to help users understand what they can do.
 * Supports:
 * - Developer persona
 * - Data Analyst persona
 * - Student/Researcher persona
 * - Office Worker persona
 */

import { useState, useCallback } from 'react'
import {
  Send,
  FolderOpen,
  Sparkles,
  ChevronRight,
  Code,
  BarChart3,
  BookOpen,
  FileText,
  Upload,
} from 'lucide-react'
import { useSettingsStore } from '@/store/settings.store'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { selectFolderReadWrite } from '@/services/fsAccess.service'
import { useT } from '@/i18n'

//=============================================================================
// Types and Data
//=============================================================================

interface Persona {
  id: string
  icon: React.ElementType
  title: string
  titleKey: string
  description: string
  descriptionKey: string
  examples: { text: string; textKey: string }[]
  color: string
}

const PERSONAS: Persona[] = [
  {
    id: 'developer',
    icon: Code,
    title: 'Developer',
    titleKey: 'welcome.personas.developer.title',
    description: 'Code understanding, debugging, refactoring',
    descriptionKey: 'welcome.personas.developer.description',
    examples: [
      { text: 'Explain how this function works', textKey: 'welcome.personas.developer.examples.0' },
      { text: 'Find bugs in this code', textKey: 'welcome.personas.developer.examples.1' },
      { text: 'Refactor for better performance', textKey: 'welcome.personas.developer.examples.2' },
    ],
    color: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
  },
  {
    id: 'analyst',
    icon: BarChart3,
    title: 'Data Analyst',
    titleKey: 'welcome.personas.analyst.title',
    description: 'Data processing, visualization, insights',
    descriptionKey: 'welcome.personas.analyst.description',
    examples: [
      { text: 'Analyze sales data in CSV', textKey: 'welcome.personas.analyst.examples.0' },
      { text: 'Create charts from Excel', textKey: 'welcome.personas.analyst.examples.1' },
      { text: 'Summarize key metrics', textKey: 'welcome.personas.analyst.examples.2' },
    ],
    color: 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100',
  },
  {
    id: 'researcher',
    icon: BookOpen,
    title: 'Student / Researcher',
    titleKey: 'welcome.personas.researcher.title',
    description: 'Document reading, learning, knowledge organization',
    descriptionKey: 'welcome.personas.researcher.description',
    examples: [
      { text: 'Summarize this documentation', textKey: 'welcome.personas.researcher.examples.0' },
      { text: 'Explain technical concepts', textKey: 'welcome.personas.researcher.examples.1' },
      { text: 'Find information across files', textKey: 'welcome.personas.researcher.examples.2' },
    ],
    color: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100',
  },
  {
    id: 'office',
    icon: FileText,
    title: 'Office Worker',
    titleKey: 'welcome.personas.office.title',
    description: 'Document processing, reporting, content creation',
    descriptionKey: 'welcome.personas.office.description',
    examples: [
      { text: 'Draft a report from data', textKey: 'welcome.personas.office.examples.0' },
      { text: 'Format and organize documents', textKey: 'welcome.personas.office.examples.1' },
      { text: 'Process multiple files', textKey: 'welcome.personas.office.examples.2' },
    ],
    color: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100',
  },
]

//=============================================================================
// Component Props
//=============================================================================

interface WelcomeScreenProps {
  onStartConversation: (text: string) => void
}

//=============================================================================
// Main Component
//=============================================================================

export function WelcomeScreenV2({ onStartConversation }: WelcomeScreenProps) {
  const [input, setInput] = useState('')
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null)
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

  const handlePersonaClick = (persona: Persona) => {
    setSelectedPersona(persona.id)
    // Use first example as placeholder
    setInput(persona.examples[0].text)
  }

  const handleExampleClick = (exampleText: string) => {
    setInput(exampleText)
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
      // Generate a prompt based on the dropped files
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
      className="flex h-full flex-col items-center justify-center bg-white px-4"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="w-full max-w-4xl">
        {/* Logo & Tagline */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 shadow-sm">
            <Sparkles className="h-7 w-7 text-primary-600" />
          </div>
          <h1 className="mb-2 text-3xl font-semibold text-neutral-900">{t('welcome.title')}</h1>
          <p className="text-base text-neutral-500">{t('welcome.tagline')}</p>
        </div>

        {/* Personas Grid */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERSONAS.map((persona) => {
            const Icon = persona.icon
            const isSelected = selectedPersona === persona.id
            return (
              <button
                key={persona.id}
                type="button"
                onClick={() => handlePersonaClick(persona)}
                className={`flex flex-col items-start rounded-xl border-2 p-4 text-left transition-all ${
                  isSelected
                    ? persona.color + ' ring-2 ring-offset-2'
                    : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100'
                }`}
              >
                <div
                  className={`mb-2 rounded-lg p-2 ${isSelected ? 'bg-white/50' : 'bg-neutral-200'}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-neutral-900">{persona.title}</h3>
                <p className="text-xs text-neutral-500">{persona.description}</p>
              </button>
            )
          })}
        </div>

        {/* Example questions (based on selected persona) */}
        {selectedPersona && (
          <div className="mb-6 rounded-xl bg-neutral-50 p-4">
            <p className="mb-3 text-sm font-medium text-neutral-700">Try asking:</p>
            <div className="flex flex-wrap gap-2">
              {PERSONAS.find((p) => p.id === selectedPersona)?.examples.map((example, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleExampleClick(example.text)}
                  className="hover:border-primary-300 flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
                >
                  <span>{example.text}</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input area with drag overlay */}
        <div className="relative mb-6">
          {/* Drag overlay */}
          {isDragging && (
            <div className="border-primary-400 absolute inset-0 z-10 -m-2 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-primary-50/90">
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
            rows={3}
            className="focus:border-primary-300 focus:ring-primary-300 w-full resize-none rounded-2xl border border-neutral-200 bg-neutral-50 px-5 py-4 pr-14 text-sm text-neutral-900 shadow-sm transition-all placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2"
            disabled={!hasApiKey}
          />

          {/* Dropped files indicator */}
          {draggedFiles && (
            <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-neutral-200 bg-neutral-100 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary-600" />
                <span className="text-sm font-medium text-neutral-700">
                  {draggedFiles.length} file{draggedFiles.length > 1 ? 's' : ''} ready
                </span>
                <button
                  type="button"
                  onClick={() => setDraggedFiles(null)}
                  className="ml-auto text-neutral-400 hover:text-neutral-600"
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
                      className="flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs text-neutral-600"
                    >
                      <span>{getFileTypeIcon(file.name)}</span>
                      <span className="max-w-[100px] truncate">{file.name}</span>
                    </div>
                  ))}
                {draggedFiles.length > 5 && (
                  <div className="rounded-lg bg-neutral-200 px-2 py-1 text-xs text-neutral-600">
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
              className="flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-normal text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
            >
              <FolderOpen className="h-4 w-4" />
              {t('folderSelector.openFolder')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setInput('What can you help me with?')}
            disabled={!hasApiKey}
            className="flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-normal text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {t('welcome.viewCapabilities') || 'View Capabilities'}
          </button>
        </div>

        {/* Recent conversations hint */}
        {conversations.length > 0 && (
          <p className="mt-8 text-center text-xs text-neutral-400">{t('welcome.recentHint')}</p>
        )}
      </div>
    </div>
  )
}
