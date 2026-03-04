/**
 * SmartSuggestions - 智能建议组件
 *
 * 基于 IntelligenceCoordinator 提供上下文感知的建议：
 * - 根据用户输入推荐工具
 * - 基于项目类型的快捷操作
 * - 最近使用的工作流
 * - 拖拽文件上传支持
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
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [projectType, setProjectType] = useState<string | null>(null)

  const { directoryHandle } = useAgentStore()
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Load project type on mount
  useEffect(() => {
    const loadProjectType = async () => {
      if (!directoryHandle) return

      try {
        const coordinator = getIntelligenceCoordinator()
        const detected = await coordinator.quickDetectProjectType(directoryHandle)
        if (detected) {
          setProjectType(detected.type)
        }
      } catch (error) {
        console.warn('[SmartSuggestions] Failed to detect project type:', error)
      }
    }

    loadProjectType()
  }, [directoryHandle])

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

    // 2. Add workflow suggestions based on project type
    if (projectType) {
      const workflowIcon = Lightbulb

      switch (projectType) {
        case 'typescript':
        case 'react':
          items.push({
            id: 'workflow-ts-analysis',
            type: 'workflow',
            title: 'Analyze TypeScript Code',
            description: 'Find types, functions, and dependencies',
            icon: workflowIcon,
            action: () => {
              onExecutePrompt?.('Analyze the TypeScript code structure in this project')
            },
          })
          break
        case 'python':
          items.push({
            id: 'workflow-python-analysis',
            type: 'workflow',
            title: 'Analyze Python Code',
            description: 'Find classes, functions, and imports',
            icon: workflowIcon,
            action: () => {
              onExecutePrompt?.('Analyze the Python code structure in this project')
            },
          })
          break
        case 'data':
          items.push({
            id: 'workflow-data-analysis',
            type: 'workflow',
            title: 'Data Analysis',
            description: 'Analyze CSV/JSON data files',
            icon: workflowIcon,
            action: () => {
              onExecutePrompt?.('Find and analyze data files (CSV, JSON)')
            },
          })
          break
      }
    }

    // 3. Add file upload suggestion if no directory
    if (!directoryHandle) {
      items.push({
        id: 'upload-directory',
        type: 'upload',
        title: 'Select Project Folder',
        description: 'Choose a folder to analyze',
        icon: Upload,
        action: () => {
          // This will be handled by the parent component
          onExecutePrompt?.('Please help me select a project folder to get started')
        },
      })
    }

    setSuggestions(items.slice(0, 6))
  }, [directoryHandle, projectType, onExecutePrompt])

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
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary-500 bg-primary-50 transition-colors dark:border-primary-900/50 dark:bg-primary-950/20">
          <div className="text-center">
            <Upload className="mx-auto mb-2 h-8 w-8 text-primary-600" />
            <p className="text-primary-900 text-sm font-medium dark:text-primary-200">Drop files to analyze</p>
          </div>
        </div>
      )}

      {/* Suggestions header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-600" />
          <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Smart Suggestions</h3>
        </div>
        <button
          onClick={generateSuggestions}
          className="rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title="Refresh suggestions"
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
              className="hover:border-primary-300 group flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-left transition-all hover:bg-primary-50/50 hover:shadow-sm dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              <div
                className={`rounded-lg p-2 ${
                  item.type === 'upload'
                    ? 'bg-primary-100 group-hover:bg-primary-200 dark:bg-primary-900/30 dark:group-hover:bg-primary-900/40'
                    : 'bg-neutral-100 group-hover:bg-primary-100 dark:bg-neutral-800 dark:group-hover:bg-primary-900/30'
                } transition-colors`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    item.type === 'upload'
                      ? 'text-primary-600'
                      : 'text-neutral-600 group-hover:text-primary-600'
                  } transition-colors`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="group-hover:text-primary-900 text-sm font-medium text-neutral-900 dark:text-neutral-100 dark:group-hover:text-primary-200">
                  {item.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">{item.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-neutral-400 transition-colors group-hover:text-primary-600" />
            </button>
          )
        })}

        {/* Empty state */}
        {suggestions.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <Lightbulb className="mx-auto mb-2 h-8 w-8 text-neutral-400" />
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {directoryHandle
                ? 'Select a folder to get personalized suggestions'
                : 'No suggestions available'}
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
      prompts.push('Show me all available tools and capabilities')
    }

    if (lowerInput.includes('find') || lowerInput.includes('search')) {
      prompts.push('Find all files matching a pattern')
      prompts.push('Search for text inside files')
    }

    if (lowerInput.includes('analyze') || lowerInput.includes('understand')) {
      prompts.push('Analyze the project structure')
      prompts.push('Explain how the code works')
    }

    setSuggestions([...new Set(prompts)].slice(0, 4))
  }, [userInput, isVisible])

  if (!isVisible || suggestions.length === 0) {
    return null
  }

  return (
    <div className="mb-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-900">
      <p className="mb-2 px-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">Suggestions</p>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(suggestion)}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-primary-50 hover:text-primary-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-200"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
