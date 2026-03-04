/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ToolsPanel - Display available AI capabilities/tools
 *
 * Shows all available tools with descriptions and examples.
 * Helps users discover what the AI can do.
 */

import { useState, useMemo } from 'react'
import {
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Info,
  Code,
  FileSearch,
  Terminal,
  Zap,
} from 'lucide-react'
import { getToolRegistry } from '@/agent/tool-registry'

//=============================================================================
// Types
//=============================================================================

interface ToolInfo {
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean }>
  examples?: string[]
}

//=============================================================================
// Tool Categories Configuration
//=============================================================================

const TOOL_CATEGORIES = [
  {
    id: 'discovery',
    name: 'File Discovery',
    nameKey: 'tools.categories.discovery',
    icon: FileSearch,
    description: 'Find and explore files in your project',
    descriptionKey: 'tools.categories.discovery.description',
    toolNames: ['glob', 'list_files', 'grep'],
  },
  {
    id: 'operations',
    name: 'File Operations',
    nameKey: 'tools.categories.operations',
    icon: FileSearch,
    description: 'Read, write, and edit files',
    descriptionKey: 'tools.categories.operations.description',
    toolNames: ['file_read', 'file_write', 'file_edit', 'file_batch', 'file_sync'],
  },
  {
    id: 'code',
    name: 'Code Execution',
    nameKey: 'tools.categories.code',
    icon: Terminal,
    description: 'Run Python and JavaScript code for analysis and automation',
    descriptionKey: 'tools.categories.code.description',
    toolNames: ['run_python_code', 'run_javascript_code'],
  },
  {
    id: 'mcp',
    name: 'MCP Services',
    nameKey: 'tools.categories.mcp',
    icon: Zap,
    description: 'External AI capabilities via MCP protocol',
    descriptionKey: 'tools.categories.mcp.description',
    toolNames: [], // Populated dynamically
  },
]

//=============================================================================
// Component Props
//=============================================================================

interface ToolsPanelProps {
  isOpen: boolean
  onClose: () => void
}

//=============================================================================
// Main Component
//=============================================================================

export function ToolsPanel({ isOpen, onClose }: ToolsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['discovery']))
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null)

  // Get tool definitions from registry
  const toolCategories = useMemo(() => {
    const registry = getToolRegistry()
    const definitions = registry.getToolDefinitions()

    // Build tool info map
    const toolInfoMap = new Map<string, ToolInfo>()
    for (const def of definitions) {
      const params = def.function.parameters?.properties || {}
      const required = new Set(def.function.parameters?.required || [])

      toolInfoMap.set(def.function.name, {
        name: def.function.name,
        description: def.function.description,
        parameters: Object.fromEntries(
          Object.entries(params).map(([key, val]: [string, any]) => [
            key,
            {
              type: val.type,
              description: val.description,
              required: required.has(key),
            },
          ])
        ),
      })
    }

    // Build categories
    return TOOL_CATEGORIES.map((cat) => ({
      ...cat,
      tools: cat.toolNames
        .map((name) => toolInfoMap.get(name))
        .filter((t): t is ToolInfo => t !== undefined),
    }))
  }, [])

  // Filter categories based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return toolCategories

    const query = searchQuery.toLowerCase()
    return toolCategories
      .map((cat) => ({
        ...cat,
        tools: cat.tools.filter(
          (tool) =>
            tool.name.toLowerCase().includes(query) ||
            tool.description.toLowerCase().includes(query)
        ),
      }))
      .filter((cat) => cat.tools.length > 0)
  }, [toolCategories, searchQuery])

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/20 transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-xl dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Available Tools</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {filteredCategories.reduce((sum, cat) => sum + cat.tools.length, 0)} tools available
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools..."
              className="focus:border-primary-300 w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:bg-neutral-900"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredCategories.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-neutral-500 dark:text-neutral-400">No tools found matching "{searchQuery}"</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCategories.map((category) => {
                const Icon = category.icon
                const isExpanded = expandedCategories.has(category.id)

                return (
                  <div
                    key={category.id}
                    className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700"
                  >
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary-50 p-2">
                          <Icon className="h-4 w-4 text-primary-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{category.name}</h3>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">{category.description}</p>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-neutral-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-neutral-400" />
                      )}
                    </button>

                    {/* Tools List */}
                    {isExpanded && (
                      <div className="border-t border-neutral-200 bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-800/50">
                        {category.tools.map((tool) => (
                          <div
                            key={tool.name}
                            className="border-b border-neutral-200 last:border-b-0 dark:border-neutral-700"
                          >
                            <button
                              onClick={() => setSelectedTool(tool)}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white dark:hover:bg-neutral-900"
                            >
                              <Code className="mt-0.5 h-4 w-4 flex-shrink-0 text-neutral-400" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                    {tool.name}
                                  </span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">
                                  {tool.description}
                                </p>
                              </div>
                              <Info className="h-4 w-4 flex-shrink-0 text-neutral-400" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-700 dark:bg-neutral-800">
          <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
            These tools are available to the AI when processing your requests
          </p>
        </div>
      </div>

      {/* Tool Detail Modal */}
      {selectedTool && (
        <ToolDetailModal tool={selectedTool} onClose={() => setSelectedTool(null)} />
      )}
    </>
  )
}

//=============================================================================
// Tool Detail Modal
//=============================================================================

interface ToolDetailModalProps {
  tool: ToolInfo
  onClose: () => void
}

function ToolDetailModal({ tool, onClose }: ToolDetailModalProps) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-neutral-900"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary-50 p-2">
                <Code className="h-4 w-4 text-primary-600" />
              </div>
              <h3 className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{tool.name}</h3>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Description */}
            <div className="mb-6">
              <h4 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Description</h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{tool.description}</p>
            </div>

            {/* Parameters */}
            {Object.keys(tool.parameters).length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">Parameters</h4>
                <div className="space-y-3">
                  {Object.entries(tool.parameters).map(([name, param]) => (
                    <div
                      key={name}
                      className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <code className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{name}</code>
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">({param.type})</span>
                        {param.required && <span className="text-xs text-red-500">required</span>}
                      </div>
                      <p className="text-xs text-neutral-600 dark:text-neutral-300">{param.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-200 bg-neutral-50 px-6 py-4 dark:border-neutral-700 dark:bg-neutral-800">
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
