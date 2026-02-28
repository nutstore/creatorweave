/**
 * QuickActionsPanel - 快捷操作面板
 *
 * 提供常用操作的快速入口，按场景分类。
 * 功能：
 * - 快速命令模板
 * - 最近使用的文件
 * - 快速代码执行
 * - 可折叠/展开
 */

import { useState, useCallback, useEffect } from 'react'
import {
  X,
  Search,
  ChevronRight,
  Code,
  FileSearch,
  BarChart3,
  Zap,
  Terminal,
  FolderOpen,
  Clock,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { useAgentStore } from '@/store/agent.store'
import { useConversationStore } from '@/store/conversation.store'
import { useSettingsStore } from '@/store/settings.store'
import { createUserMessage } from '@/agent/message-types'
import { getIntelligenceCoordinator } from '@/agent/intelligence-coordinator'

//=============================================================================
// Types
//=============================================================================

interface QuickAction {
  id: string
  label: string
  labelKey: string
  description: string
  descriptionKey: string
  icon: React.ElementType
  prompt: string
  category: ActionCategory
}

type ActionCategory = 'discovery' | 'code' | 'analysis' | 'automation' | 'all'

//=============================================================================
// Quick Actions Configuration
//=============================================================================

const QUICK_ACTIONS: QuickAction[] = [
  // File Discovery
  {
    id: 'find-files',
    label: 'Find Files',
    labelKey: 'quickActions.findFiles',
    description: 'Search for files by pattern',
    descriptionKey: 'quickActions.findFiles.description',
    icon: FileSearch,
    category: 'discovery',
    prompt: 'Find all TypeScript files in the src directory',
  },
  {
    id: 'search-code',
    label: 'Search Code',
    labelKey: 'quickActions.searchCode',
    description: 'Search for text in files',
    descriptionKey: 'quickActions.searchCode.description',
    icon: FileSearch,
    category: 'discovery',
    prompt: 'Search for "function" in all .ts files',
  },

  // Code Operations
  {
    id: 'explain-code',
    label: 'Explain Code',
    labelKey: 'quickActions.explainCode',
    description: 'Get an explanation of code',
    descriptionKey: 'quickActions.explainCode.description',
    icon: Code,
    category: 'code',
    prompt: 'Explain what this file does',
  },
  {
    id: 'run-javascript',
    label: 'Run JavaScript',
    labelKey: 'quickActions.runJavaScript',
    description: 'Execute JavaScript code',
    descriptionKey: 'quickActions.runJavaScript.description',
    icon: Terminal,
    category: 'code',
    prompt: 'I want to run some JavaScript code',
  },
  {
    id: 'run-python',
    label: 'Run Python',
    labelKey: 'quickActions.runPython',
    description: 'Execute Python code',
    descriptionKey: 'quickActions.runPython.description',
    icon: Terminal,
    category: 'code',
    prompt: 'I want to run some Python code',
  },

  // Data Analysis
  {
    id: 'analyze-csv',
    label: 'Analyze CSV',
    labelKey: 'quickActions.analyzeCSV',
    description: 'Analyze CSV data',
    descriptionKey: 'quickActions.analyzeCSV.description',
    icon: BarChart3,
    category: 'analysis',
    prompt: 'Find CSV files and analyze them',
  },
  {
    id: 'create-chart',
    label: 'Create Chart',
    labelKey: 'quickActions.createChart',
    description: 'Generate charts from data',
    descriptionKey: 'quickActions.createChart.description',
    icon: BarChart3,
    category: 'analysis',
    prompt: 'Create a chart from the data',
  },

  // Automation
  {
    id: 'batch-rename',
    label: 'Batch Rename',
    labelKey: 'quickActions.batchRename',
    description: 'Rename multiple files',
    descriptionKey: 'quickActions.batchRename.description',
    icon: Zap,
    category: 'automation',
    prompt: 'Help me rename multiple files at once',
  },
  {
    id: 'convert-files',
    label: 'Convert Files',
    labelKey: 'quickActions.convertFiles',
    description: 'Convert file formats',
    descriptionKey: 'quickActions.convertFiles.description',
    icon: Zap,
    category: 'automation',
    prompt: 'Convert files from one format to another',
  },
]

const CATEGORIES = [
  { id: 'all', name: 'All', nameKey: 'quickActions.categories.all', icon: Zap },
  {
    id: 'discovery',
    name: 'Discovery',
    nameKey: 'quickActions.categories.discovery',
    icon: FileSearch,
  },
  { id: 'code', name: 'Code', nameKey: 'quickActions.categories.code', icon: Code },
  {
    id: 'analysis',
    name: 'Analysis',
    nameKey: 'quickActions.categories.analysis',
    icon: BarChart3,
  },
  {
    id: 'automation',
    name: 'Automation',
    nameKey: 'quickActions.categories.automation',
    icon: Zap,
  },
]

//=============================================================================
// Component Props
//=============================================================================

interface QuickActionsPanelProps {
  isOpen: boolean
  onClose: () => void
  onStartConversation?: (text: string) => void
  activeTab?: 'actions' | 'smart' | 'upload'
}

//=============================================================================
// Main Component
//=============================================================================

export function QuickActionsPanel({
  isOpen,
  onClose,
  onStartConversation,
  activeTab: controlledTab,
}: QuickActionsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ActionCategory>('all')
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<'actions' | 'smart' | 'upload'>(
    controlledTab || 'actions'
  )
  const [projectType, setProjectType] = useState<string | null>(null)
  const [smartSuggestions, setSmartSuggestions] = useState<
    Array<{
      id: string
      title: string
      description: string
      prompt: string
    }>
  >([])

  const { directoryHandle, setDirectoryHandle } = useAgentStore()
  const { activeConversationId, createNew, setActive, runAgent, updateMessages } =
    useConversationStore()
  const { providerType, modelName, maxTokens } = useSettingsStore()

  // Load recent files from localStorage
  useState(() => {
    try {
      const stored = localStorage.getItem('recent-files')
      if (stored) {
        setRecentFiles(JSON.parse(stored).slice(0, 5))
      }
    } catch {
      // Ignore
    }
  })

  // Load project type and smart suggestions
  useEffect(() => {
    const loadSmartData = async () => {
      if (!directoryHandle) return

      try {
        const coordinator = getIntelligenceCoordinator()

        // Detect project type
        const detected = await coordinator.quickDetectProjectType(directoryHandle)
        if (detected) {
          setProjectType(detected.type)
        }

        // Get tool recommendations
        const allTools = coordinator.getAllTools()
        const suggestions = []

        // Get top 3 tools across all categories
        for (const tools of Object.values(allTools)) {
          for (const tool of tools.slice(0, 1)) {
            suggestions.push({
              id: tool.toolName,
              title: tool.displayName,
              description: tool.reason,
              prompt: `Help me use the ${tool.displayName} tool`,
            })
            if (suggestions.length >= 5) break
          }
          if (suggestions.length >= 5) break
        }

        setSmartSuggestions(suggestions)
      } catch (error) {
        console.warn('[QuickActionsPanel] Failed to load smart data:', error)
      }
    }

    loadSmartData()
  }, [directoryHandle])

  // Filter actions by category and search
  const filteredActions = QUICK_ACTIONS.filter((action) => {
    const matchesCategory = selectedCategory === 'all' || action.category === selectedCategory
    const matchesSearch =
      !searchQuery.trim() ||
      action.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      action.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const handleActionClick = useCallback(
    (action: QuickAction) => {
      if (activeConversationId) {
        // Add to existing conversation
        const userMsg = createUserMessage(action.prompt)
        const currentConv = useConversationStore
          .getState()
          .conversations.find((c) => c.id === activeConversationId)
        const currentMessages = currentConv ? [...currentConv.messages, userMsg] : [userMsg]
        updateMessages(activeConversationId, currentMessages)
        runAgent(activeConversationId, providerType, modelName, maxTokens, directoryHandle)
      } else if (onStartConversation) {
        // Create new conversation
        onStartConversation(action.prompt)
      } else {
        // Fallback: create new conversation
        const conv = createNew(action.label)
        setActive(conv.id)
        setTimeout(() => {
          const userMsg = createUserMessage(action.prompt)
          const currentConv = useConversationStore
            .getState()
            .conversations.find((c) => c.id === conv.id)
          const currentMessages = currentConv ? [...currentConv.messages, userMsg] : [userMsg]
          updateMessages(conv.id, currentMessages)
          runAgent(conv.id, providerType, modelName, maxTokens, directoryHandle)
        }, 100)
      }
      onClose()
    },
    [
      activeConversationId,
      directoryHandle,
      createNew,
      setActive,
      onClose,
      onStartConversation,
      updateMessages,
      runAgent,
      providerType,
      modelName,
      maxTokens,
    ]
  )

  const handleSelectFolder = async () => {
    try {
      const { selectFolderReadWrite } = await import('@/services/fsAccess.service')
      const handle = await selectFolderReadWrite()
      setDirectoryHandle(handle)
    } catch (error) {
      if (error instanceof Error && error.message === 'User cancelled') return
      console.error('Failed to select folder:', error)
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed left-0 top-0 z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Quick Actions</h2>
            <p className="text-sm text-neutral-500">Common tasks and shortcuts</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-200 px-2">
          <button
            onClick={() => setActiveTab('actions')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'actions'
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Zap className="h-4 w-4" />
            Actions
          </button>
          <button
            onClick={() => setActiveTab('smart')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'smart'
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            Smart
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'upload'
                ? 'border-b-2 border-primary-500 text-primary-600'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <FolderOpen className="h-4 w-4" />
            Upload
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Actions Tab */}
          {activeTab === 'actions' && (
            <div className="p-4">
              {/* Search */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search actions..."
                    className="focus:border-primary-300 w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </div>
              </div>

              {/* Category Tabs */}
              <div className="mb-4 flex gap-1 overflow-x-auto">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const isActive = selectedCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id as ActionCategory)}
                      className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-neutral-600 hover:bg-neutral-100'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{cat.name}</span>
                    </button>
                  )
                })}
              </div>

              {/* Quick Actions List */}
              <div className="space-y-2">
                {filteredActions.map((action) => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.id}
                      onClick={() => handleActionClick(action)}
                      className="hover:border-primary-300 flex w-full items-start gap-3 rounded-xl border border-neutral-200 p-3 text-left transition-colors hover:bg-primary-50/50"
                    >
                      <div className="mt-0.5 rounded-lg bg-primary-50 p-2">
                        <Icon className="h-4 w-4 text-primary-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900">{action.label}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">{action.description}</p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 text-neutral-400" />
                    </button>
                  )
                })}
              </div>

              {/* Recent Files */}
              {recentFiles.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    Recent Files
                  </h3>
                  <div className="space-y-1">
                    {recentFiles.map((file, idx) => (
                      <button
                        key={idx}
                        className="group flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-neutral-100"
                      >
                        <Clock className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600" />
                        <span className="truncate text-sm text-neutral-700">{file}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Smart Tab */}
          {activeTab === 'smart' && (
            <div className="p-4">
              {/* Project Type Badge */}
              {projectType && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2">
                  <Sparkles className="h-4 w-4 text-primary-600" />
                  <span className="text-primary-900 text-sm font-medium">
                    {projectType.charAt(0).toUpperCase() + projectType.slice(1)} Project Detected
                  </span>
                </div>
              )}

              {/* Smart Suggestions */}
              <div className="mb-2">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-neutral-700">Suggested for You</h3>
                  <button
                    onClick={() => {
                      // Refresh suggestions
                      const coordinator = getIntelligenceCoordinator()
                      const allTools = coordinator.getAllTools()
                      const suggestions = []
                      for (const tools of Object.values(allTools)) {
                        for (const tool of tools.slice(0, 1)) {
                          suggestions.push({
                            id: tool.toolName,
                            title: tool.displayName,
                            description: tool.reason,
                            prompt: `Help me use the ${tool.displayName} tool`,
                          })
                          if (suggestions.length >= 5) break
                        }
                        if (suggestions.length >= 5) break
                      }
                      setSmartSuggestions(suggestions)
                    }}
                    className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                    title="Refresh suggestions"
                  >
                    <TrendingUp className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {smartSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      onClick={() => {
                        if (activeConversationId) {
                          const userMsg = createUserMessage(suggestion.prompt)
                          const currentConv = useConversationStore
                            .getState()
                            .conversations.find((c) => c.id === activeConversationId)
                          const currentMessages = currentConv
                            ? [...currentConv.messages, userMsg]
                            : [userMsg]
                          updateMessages(activeConversationId, currentMessages)
                          runAgent(
                            activeConversationId,
                            providerType,
                            modelName,
                            maxTokens,
                            directoryHandle
                          )
                        } else if (onStartConversation) {
                          onStartConversation(suggestion.prompt)
                        }
                        onClose()
                      }}
                      className="hover:border-primary-300 flex w-full items-start gap-3 rounded-xl border border-neutral-200 p-3 text-left transition-colors hover:bg-primary-50/50"
                    >
                      <div className="mt-0.5 rounded-lg bg-gradient-to-br from-primary-50 to-purple-50 p-2">
                        <Sparkles className="h-4 w-4 text-primary-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900">{suggestion.title}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">{suggestion.description}</p>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 text-neutral-400" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Project-Specific Suggestions */}
              {projectType === 'typescript' && (
                <div className="mt-6">
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
                    TypeScript Actions
                  </h3>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        const prompt =
                          'Analyze the TypeScript code structure, find all types, interfaces, and their relationships'
                        if (onStartConversation) onStartConversation(prompt)
                        onClose()
                      }}
                      className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-neutral-100"
                    >
                      <Code className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-neutral-700">Analyze Types & Interfaces</span>
                    </button>
                    <button
                      onClick={() => {
                        const prompt = 'Find all React components and their props'
                        if (onStartConversation) onStartConversation(prompt)
                        onClose()
                      }}
                      className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-neutral-100"
                    >
                      <Code className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-neutral-700">Find React Components</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload Tab */}
          {activeTab === 'upload' && (
            <div className="p-4">
              {/* Folder Selection */}
              <div className="mb-4 rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-6 text-center">
                <FolderOpen className="mx-auto mb-3 h-10 w-10 text-neutral-400" />
                <p className="mb-2 text-sm font-medium text-neutral-900">Select Project Folder</p>
                <p className="mb-4 text-xs text-neutral-500">
                  Choose a folder to analyze its contents
                </p>
                <button
                  onClick={handleSelectFolder}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
                >
                  Browse Folders
                </button>
              </div>

              {/* Current Folder Info */}
              {directoryHandle && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="mb-1 text-sm font-medium text-green-900">Folder Selected</p>
                  <p className="text-xs text-green-700">{directoryHandle.name}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-4">
          <p className="text-center text-xs text-neutral-500">
            Press <kbd className="rounded bg-neutral-200 px-1 py-0.5 font-mono">Cmd+K</kbd> to open
            quick actions
          </p>
        </div>
      </div>
    </>
  )
}
