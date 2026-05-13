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
} from 'lucide-react'
import { getToolRegistry, getToolCategoryMap } from '@/agent/tool-registry'

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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([]))
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null)

  // Get tool definitions from registry — dynamically build categories
  const toolCategories = useMemo(() => {
    const registry = getToolRegistry()
    const definitions = registry.getToolDefinitions()
    const categoryMap = getToolCategoryMap()

    // Build tool info list
    const allTools: ToolInfo[] = definitions.map((def) => {
      const params = def.function.parameters?.properties || {}
      const required = new Set(def.function.parameters?.required || [])
      return {
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
      }
    })

    // Group by ToolPromptDoc category
    const groupMap = new Map<string, ToolInfo[]>()
    const groupOrder: string[] = []
    for (const tool of allTools) {
      const meta = categoryMap.get(tool.name)
      const group = meta?.section ?? '### Other'
      if (!groupMap.has(group)) {
        groupMap.set(group, [])
        groupOrder.push(group)
      }
      groupMap.get(group)!.push(tool)
    }

    // Sort tools within each group
    for (const tools of groupMap.values()) {
      tools.sort((a, b) => a.name.localeCompare(b.name))
    }

    return groupOrder.map((section) => ({
      id: section,
      name: section.replace(/^###\s*/, ''),
      tools: groupMap.get(section)!,
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
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-card shadow-xl dark:bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border px-6 py-4 dark:border-border">
          <div>
            <h2 className="text-lg font-semibold text-primary dark:text-primary-foreground">Available Tools</h2>
            <p className="text-sm text-tertiary dark:text-muted">
              {filteredCategories.reduce((sum, cat) => sum + cat.tools.length, 0)} tools available
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-tertiary transition-colors hover:bg-muted hover:text-secondary dark:text-muted dark:hover:bg-muted dark:hover:text-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border px-6 py-4 dark:border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tools..."
              className="focus:border-primary-300 w-full rounded-lg border border bg-muted py-2 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-border dark:bg-muted dark:text-primary-foreground dark:placeholder:text-muted dark:focus:bg-card"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filteredCategories.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-tertiary dark:text-muted">No tools found matching "{searchQuery}"</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCategories.map((category) => {
                const isExpanded = expandedCategories.has(category.id)

                return (
                  <div
                    key={category.id}
                    className="overflow-hidden rounded-xl border border dark:border-border"
                  >
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted dark:hover:bg-muted"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary-50 p-2">
                          <Code className="h-4 w-4 text-primary-600" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-primary dark:text-primary-foreground">{category.name}</h3>
                          <p className="text-xs text-tertiary dark:text-muted">{category.tools.length} tools</p>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-tertiary" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-tertiary" />
                      )}
                    </button>

                    {/* Tools List */}
                    {isExpanded && (
                      <div className="border-t border bg-muted/50 dark:border-border dark:bg-muted/50">
                        {category.tools.map((tool) => (
                          <div
                            key={tool.name}
                            className="border-b border last:border-b-0 dark:border-border"
                          >
                            <button
                              onClick={() => setSelectedTool(tool)}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white dark:hover:bg-card"
                            >
                              <Code className="mt-0.5 h-4 w-4 flex-shrink-0 text-tertiary" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-sm font-medium text-primary dark:text-primary-foreground">
                                    {tool.name}
                                  </span>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-secondary dark:text-muted">
                                  {tool.description}
                                </p>
                              </div>
                              <Info className="h-4 w-4 flex-shrink-0 text-tertiary" />
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
        <div className="border-t border bg-muted px-6 py-4 dark:border-border dark:bg-muted">
          <p className="text-center text-xs text-tertiary dark:text-muted">
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
          className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-card shadow-xl dark:bg-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border px-6 py-4 dark:border-border">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary-50 p-2">
                <Code className="h-4 w-4 text-primary-600" />
              </div>
              <h3 className="font-mono font-semibold text-primary dark:text-primary-foreground">{tool.name}</h3>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-tertiary transition-colors hover:bg-muted hover:text-secondary dark:text-muted dark:hover:bg-muted dark:hover:text-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {/* Description */}
            <div className="mb-6">
              <h4 className="mb-2 text-sm font-medium text-secondary dark:text-muted">Description</h4>
              <p className="text-sm text-secondary dark:text-tertiary">{tool.description}</p>
            </div>

            {/* Parameters */}
            {Object.keys(tool.parameters).length > 0 && (
              <div>
                <h4 className="mb-3 text-sm font-medium text-secondary dark:text-muted">Parameters</h4>
                <div className="space-y-3">
                  {Object.entries(tool.parameters).map(([name, param]) => (
                    <div
                      key={name}
                      className="rounded-lg border border bg-muted px-4 py-3 dark:border-border dark:bg-muted"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <code className="text-sm font-medium text-primary dark:text-primary-foreground">{name}</code>
                        <span className="text-xs text-tertiary dark:text-muted">({param.type})</span>
                        {param.required && <span className="text-xs text-red-500">required</span>}
                      </div>
                      <p className="text-xs text-secondary dark:text-muted">{param.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border bg-muted px-6 py-4 dark:border-border dark:bg-muted">
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
