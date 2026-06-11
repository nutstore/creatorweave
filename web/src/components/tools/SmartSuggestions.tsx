/**
 * SmartSuggestions - Intelligent Suggestions Component
 *
 * Provides context-aware suggestions based on IntelligenceCoordinator:
 * - Recommend tools based on user input
 * - Quick actions based on project type
 * - Recently used workflows
 * - Drag-and-drop file upload support
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Sparkles,
  FileSearch,
  Code,
  BarChart3,
  Terminal,
  Upload,
  ChevronRight,
  Lightbulb,
  TrendingUp,
} from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { getIntelligenceCoordinator } from '@/agent/intelligence-coordinator'
import { useT } from '@/i18n'

//=============================================================================
// Types
//=============================================================================

interface SuggestionItem {
  id: string
  type: 'tool' | 'workflow' | 'recent' | 'upload'
  title: string
  description: string
  icon: React.ElementType
  action: () => void
  confidence?: number
}

interface SmartSuggestionsProps {
  onExecutePrompt?: (prompt: string) => void
  className?: string
}

//=============================================================================
// Suggestion Categories
//=============================================================================

const SUGGESTION_ICONS: Record<string, React.ElementType> = {
  discovery: FileSearch,
  code: Code,
  analysis: BarChart3,
  automation: Terminal,
  writing: Code,
  batch: TrendingUp,
}

//=============================================================================
// Component
//=============================================================================

export function SmartSuggestions({ onExecutePrompt, className }: SmartSuggestionsProps) {
  const t = useT()
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const directoryHandle = useAgentStore((s) => s.directoryHandle)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Generate suggestions based on context
  const generateSuggestions = useCallback(async () => {
    const coordinator = getIntelligenceCoordinator()
    const items: SuggestionItem[] = []

    // 1. Get all available tools by category
    const allTools = coordinator.getAllTools()

    // Add top tools from each category
    for (const [category, tools] of Object.entries(allTools)) {
      if (tools.length === 0) continue

      const topTool = tools[0]
      const Icon = SUGGESTION_ICONS[category] || Sparkles

      items.push({
        id: `tool-${topTool.toolName}`,
        type: 'tool',
        title: topTool.displayName,
        description: topTool.reason,
        icon: Icon,
        confidence: topTool.score,
        action: () => {
          const prompt = `Help me use the ${topTool.displayName} tool`
          onExecutePrompt?.(prompt)
        },
      })

      // Only add one tool per category
      if (items.length >= 3) break
    }

    // 2. Add a general code-analysis workflow suggestion
    items.push({
      id: 'workflow-code-analysis',
      type: 'workflow',
      title: t('tools.analyzeProjectCode'),
      description: t('tools.analyzeProjectCodeDesc'),
      icon: Lightbulb,
      action: () => {
        onExecutePrompt?.('Analyze the code structure in this project')
      },
    })

    // 3. Add file upload suggestion if no directory
    if (!directoryHandle) {
      items.push({
        id: 'upload-directory',
        type: 'upload',
        title: t('tools.selectProjectFolderShort'),
        description: t('tools.selectFolderToAnalyzeShort'),
        icon: Upload,
        action: () => {
          // This will be handled by the parent component
          onExecutePrompt?.('Please help me select a project folder to get started')
        },
      })
    }

    setSuggestions(items.slice(0, 6))
  }, [directoryHandle, onExecutePrompt, t])

  // Generate suggestions on mount and when directory changes
  useEffect(() => {
    generateSuggestions()
  }, [generateSuggestions])

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)

      const items = e.dataTransfer.items
      if (items.length === 0) return

      // Handle dropped files
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            files.push(file)
          }
        }
      }

      if (files.length > 0) {
        // Create a prompt with the dropped file info
        const fileNames = files.map((f) => f.name).join(', ')
        onExecutePrompt?.(`I've dropped these files: ${fileNames}. Please help me analyze them.`)
      }
    },
    [onExecutePrompt]
  )

  const handleSuggestionClick = useCallback((item: SuggestionItem) => {
    item.action()
  }, [])

  return (
    <div
      ref={dropZoneRef}
      className={`relative ${className || ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary-500 bg-primary-50/70 transition-colors dark:border-primary-900/50 dark:bg-primary-950/10">
          <div className="text-center">
            <Upload className="mx-auto mb-2 h-8 w-8 text-primary-600" />
            <p className="text-sm font-medium text-primary-900 dark:text-primary-200">{t('tools.dropFilesToAnalyze')}</p>
          </div>
        </div>
      )}

      {/* Suggestions header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-600" />
          <h3 className="text-sm font-medium text-secondary dark:text-muted">{t('tools.smartSuggestions')}</h3>
        </div>
        <button
          onClick={generateSuggestions}
          className="rounded-lg p-1 text-tertiary transition-colors hover:bg-muted hover:text-secondary dark:text-muted dark:bg-muted dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title={t('tools.refreshSuggestions')}
        >
          <TrendingUp className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Suggestions list */}
      <div className="space-y-2">
        {suggestions.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => handleSuggestionClick(item)}
              className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary-300 hover:bg-primary-50/50 hover:shadow-sm dark:border-border dark:bg-card dark:hover:bg-neutral-800"
            >
              <div
                className={`rounded-lg p-2 ${
                  item.type === 'upload'
                    ? 'bg-primary-100 group-hover:bg-primary-200 dark:bg-primary-900/30 dark:group-hover:bg-primary-900/40'
                    : 'bg-muted dark:bg-muted group-hover:bg-primary-100 dark:bg-muted dark:group-hover:bg-primary-900/30'
                } transition-colors`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    item.type === 'upload'
                      ? 'text-primary-600'
                      : 'text-secondary dark:text-muted group-hover:text-primary-600'
                  } transition-colors`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary group-hover:text-primary-900 dark:text-primary-foreground dark:group-hover:text-primary-200">
                  {item.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs text-tertiary dark:text-muted">{item.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-tertiary transition-colors group-hover:text-primary-600 dark:text-muted" />
            </button>
          )
        })}

        {/* Empty state */}
        {suggestions.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/50 p-6 text-center dark:border-border dark:bg-muted/50">
            <Lightbulb className="mx-auto mb-2 h-8 w-8 text-tertiary dark:text-muted" />
            <p className="text-sm text-secondary dark:text-muted">
              {directoryHandle
                ? t('tools.selectFolderForSuggestions')
                : t('tools.noSuggestionsAvailable')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

//=============================================================================
// Inline Suggestions Component (for message input area)
//=============================================================================

interface InlineSuggestionsProps {
  userInput: string
  onSelect: (suggestion: string) => void
  isVisible: boolean
}

export function InlineSuggestions({ userInput, onSelect, isVisible }: InlineSuggestionsProps) {
  const t = useT()
  const [suggestions, setSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (!isVisible || !userInput.trim()) {
      setSuggestions([])
      return
    }

    // Get tool recommendations based on input
    const coordinator = getIntelligenceCoordinator()
    const toolRecs = coordinator.getToolRecommendations(userInput, 3)

    // Convert to suggestion prompts
    const prompts = toolRecs.map((rec) => {
      return `Use ${rec.displayName} to ${rec.reason.toLowerCase()}`
    })

    // Add some generic suggestions based on keywords
    const lowerInput = userInput.toLowerCase()

    if (lowerInput.includes('help') || lowerInput.includes('what can')) {
      prompts.push(t('tools.showAvailableTools'))
    }

    if (lowerInput.includes('find') || lowerInput.includes('search')) {
      prompts.push(t('tools.findFilesMatchingPattern'))
      prompts.push(t('tools.searchTextInsideFiles'))
    }

    if (lowerInput.includes('analyze') || lowerInput.includes('understand')) {
      prompts.push(t('tools.analyzeProjectStructure'))
      prompts.push(t('tools.explainHowCodeWorks'))
    }

    setSuggestions([...new Set(prompts)].slice(0, 4))
  }, [userInput, isVisible, t])

  if (!isVisible || suggestions.length === 0) {
    return null
  }

  return (
    <div className="mb-2 rounded-xl border border-border bg-muted/50 p-2 dark:border-border dark:bg-muted/50">
      <p className="mb-2 px-2 text-xs font-medium text-tertiary dark:text-muted">{t('tools.suggestions')}</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(suggestion)}
            className="rounded-lg bg-card px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-primary-50 hover:text-primary-700 dark:bg-card dark:text-muted dark:hover:bg-primary-900/30 dark:hover:text-primary-200"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
