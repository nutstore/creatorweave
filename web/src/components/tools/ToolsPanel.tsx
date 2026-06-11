/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ToolsPanel - Display available AI capabilities/tools
 *
 * Shows all available tools with descriptions and examples.
 * Helps users discover what the AI can do.
 */

import { useState, useMemo, useEffect } from 'react'
import {
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Info,
  Code,
  Wrench,
} from 'lucide-react'
import { getToolRegistry, getToolCategoryMap, onToolsChanged } from '@/agent/tool-registry'
import { useSettingsStore } from '@/store/settings.store'
import { useT } from '@/i18n'

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
  const t = useT()
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set([]))
  const [selectedTool, setSelectedTool] = useState<ToolInfo | null>(null)

  // Re-evaluate tool list when provider changes or tools are registered/unregistered
  const providerType = useSettingsStore((s) => s.providerType)
  const [toolVersion, setToolVersion] = useState(0)
  useEffect(() => {
    return onToolsChanged(() => setToolVersion((v) => v + 1))
  }, [])

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerType, toolVersion])

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

  const totalFilteredTools = filteredCategories.reduce((sum, cat) => sum + cat.tools.length, 0)

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
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-card shadow-2xl dark:bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary-50 p-2 dark:bg-primary-900/30">
              <Wrench className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-primary dark:text-primary-foreground">
                {t('tools.availableTools')}
              </h2>
              <p className="text-xs text-tertiary dark:text-muted">
                {t('tools.toolCount', { count: totalFilteredTools })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-tertiary transition-colors hover:bg-muted hover:text-secondary dark:text-muted dark:hover:bg-muted dark:hover:text-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tertiary" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('tools.searchTools')}
              className="w-full rounded-lg border border-border bg-muted py-2 pl-10 pr-4 text-sm text-primary-foreground placeholder:text-tertiary focus:border-primary-300 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-border dark:bg-muted dark:text-primary-foreground dark:placeholder:text-muted dark:focus:bg-card"
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filteredCategories.length === 0 ? (
            <div className="py-12 text-center">
              <Search className="mx-auto mb-3 h-8 w-8 text-tertiary/40" />
              <p className="text-sm text-tertiary dark:text-muted">
                {t('tools.noToolsFound', { query: searchQuery })}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCategories.map((category) => {
                const isExpanded = expandedCategories.has(category.id)

                return (
                  <div
                    key={category.id}
                    className="overflow-hidden rounded-xl border border-border"
                  >
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted dark:hover:bg-muted"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-primary-50 p-2 dark:bg-primary-900/30">
                          <Code className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-primary dark:text-primary-foreground">{category.name}</h3>
                          <p className="text-xs text-tertiary dark:text-muted">
                            {t('tools.toolCountInCategory', { count: category.tools.length })}
                          </p>
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
                      <div className="border-t border-border bg-muted/30 dark:bg-muted/30">
                        {category.tools.map((tool) => (
                          <div
                            key={tool.name}
                            className="border-b border-border last:border-b-0"
                          >
                            <button
                              onClick={() => setSelectedTool(tool)}
                              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-card dark:hover:bg-card"
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
                              <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-tertiary" />
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
        <div className="border-t border-border bg-muted/50 px-5 py-3 dark:bg-muted/50">
          <p className="text-center text-xs text-tertiary dark:text-muted">
            {t('tools.toolsAvailableHint')}
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
  const t = useT()

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl dark:bg-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="shrink-0 rounded-lg bg-primary-50 p-2 dark:bg-primary-900/30">
                <Code className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              </div>
              <h3 className="truncate font-mono text-sm font-semibold text-primary dark:text-primary-foreground">{tool.name}</h3>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-tertiary transition-colors hover:bg-muted hover:text-secondary dark:text-muted dark:hover:bg-muted dark:hover:text-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Description */}
            <div className="mb-6">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-tertiary dark:text-muted">
                {t('tools.description')}
              </h4>
              <p className="text-sm leading-relaxed text-secondary dark:text-tertiary">{tool.description}</p>
            </div>

            {/* Parameters */}
            {Object.keys(tool.parameters).length > 0 && (
              <div>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-tertiary dark:text-muted">
                  {t('tools.parameters')}
                </h4>
                <div className="space-y-2">
                  {Object.entries(tool.parameters).map(([name, param]) => (
                    <div
                      key={name}
                      className="rounded-lg border border-border bg-muted/50 px-4 py-3 dark:bg-muted/50"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <code className="text-sm font-medium text-primary dark:text-primary-foreground">{name}</code>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-tertiary dark:bg-muted dark:text-muted">
                          {param.type}
                        </span>
                        {param.required && (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                            {t('tools.required')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-secondary dark:text-muted">{param.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border bg-muted/50 px-5 py-3 dark:bg-muted/50">
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              {t('tools.gotIt')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
