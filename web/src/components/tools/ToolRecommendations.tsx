/**
 * ToolRecommendations - Display intelligent tool recommendations
 *
 * Shows recommended tools based on:
 * - Current user message/intent
 * - Project type and structure
 * - Previous conversation context
 *
 * Phase 2: Tool Recommendation System
 */

import { useState, useEffect } from 'react'
import { Lightbulb, Sparkles, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { getIntelligenceCoordinator } from '@/agent/intelligence-coordinator'
import type { ToolRecommendation } from '@/agent/tools/tool-recommendation'

//=============================================================================
// Types
//=============================================================================

interface ToolRecommendationsProps {
  /** Current user message for analysis */
  userMessage: string
  /** Whether to show in compact mode */
  compact?: boolean
  /** Maximum recommendations to show */
  maxResults?: number
  /** Custom class name */
  className?: string
}

//=============================================================================
// Main Component
//=============================================================================

export function ToolRecommendations({
  userMessage,
  compact = false,
  maxResults = 3,
  className = '',
}: ToolRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<ToolRecommendation[]>([])
  const [isExpanded, setIsExpanded] = useState(!compact)
  const [copiedTool, setCopiedTool] = useState<string | null>(null)

  useEffect(() => {
    if (!userMessage.trim()) {
      setRecommendations([])
      return
    }

    // Get recommendations
    const coordinator = getIntelligenceCoordinator()
    const recs = coordinator.getToolRecommendations(userMessage, maxResults)
    setRecommendations(recs)
  }, [userMessage, maxResults])

  // Copy example to clipboard
  const copyExample = (example: string, toolName: string) => {
    navigator.clipboard.writeText(example)
    setCopiedTool(toolName)
    setTimeout(() => setCopiedTool(null), 2000)
  }

  // Don't render if no recommendations
  if (recommendations.length === 0) {
    return null
  }

  // Compact mode: just show a pill badge
  if (compact && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-3 py-1.5 text-sm text-warning transition-colors hover:bg-warning ${className}`}
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span>
          {recommendations.length} tool suggestion{recommendations.length > 1 ? 's' : ''}
        </span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    )
  }

  return (
    <div className={`rounded-xl border border-warning bg-warning-bg/50 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-warning-bg p-1.5">
            <Lightbulb className="h-4 w-4 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-primary dark:text-primary-foreground">Recommended Tools</h3>
            <p className="text-xs text-tertiary dark:text-muted">
              Based on your message, these tools might help
            </p>
          </div>
        </div>
        {compact && (
          <button
            onClick={() => setIsExpanded(false)}
            className="rounded-lg p-1.5 text-tertiary dark:text-muted transition-colors hover:bg-muted dark:hover:bg-muted hover:text-secondary dark:text-muted dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Recommendations */}
      <div className="divide-y divide-warning/50 border-t border-warning/50">
        {recommendations.map((rec, _index) => (
          <div key={rec.toolName} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              {/* Tool Info */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-primary dark:text-primary-foreground">
                    {rec.displayName}
                  </span>
                  {/* Relevance indicator */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.ceil(rec.score * 3) }).map((_, i) => (
                      <Sparkles
                        key={i}
                        className="h-3 w-3 text-amber-500"
                        fill={i < 2 ? 'currentColor' : 'none'}
                      />
                    ))}
                  </div>
                </div>
                <p className="mb-2 text-xs text-secondary dark:text-muted">{rec.reason}</p>

                {/* Example */}
                <div className="group relative">
                  <div className="rounded-lg border border-border bg-white px-3 py-2 dark:border-border dark:bg-card">
                    <code className="block overflow-x-auto text-xs text-neutral-700 dark:text-muted">
                      {rec.example}
                    </code>
                  </div>
                  {/* Copy button */}
                  <button
                    onClick={() => copyExample(rec.example, rec.toolName)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-tertiary dark:text-muted opacity-0 transition-opacity hover:bg-muted dark:hover:bg-muted hover:text-secondary dark:text-muted group-hover:opacity-100 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                  >
                    {copiedTool === rec.toolName ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Category badge */}
              <span className="flex-shrink-0 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-secondary dark:border-border dark:bg-card dark:text-muted">
                {rec.category}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer hint */}
      <div className="border-t border-warning/50 bg-warning-bg/30 px-4 py-2">
        <p className="text-center text-xs text-tertiary dark:text-muted">
          These tools are automatically suggested based on your intent
        </p>
      </div>
    </div>
  )
}

//=============================================================================
// Inline Suggestion Component (for chat input area)
//=============================================================================

interface InlineToolSuggestionProps {
  userMessage: string
  onSelectExample: (example: string) => void
}

export function InlineToolSuggestion({ userMessage, onSelectExample }: InlineToolSuggestionProps) {
  const [suggestions, setSuggestions] = useState<ToolRecommendation[]>([])

  useEffect(() => {
    if (!userMessage.trim()) {
      setSuggestions([])
      return
    }

    const coordinator = getIntelligenceCoordinator()
    const recs = coordinator.getToolRecommendations(userMessage, 2)
    setSuggestions(recs)
  }, [userMessage])

  if (suggestions.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span className="text-xs text-tertiary dark:text-muted dark:text-neutral-500">Try:</span>
      {suggestions.map((rec) => (
        <button
          key={rec.toolName}
          onClick={() => onSelectExample(rec.example)}
          className="inline-flex items-center gap-1 rounded-md bg-muted dark:bg-muted px-2 py-1 text-xs text-secondary dark:text-muted transition-colors hover:bg-muted dark:hover:bg-muted dark:bg-muted dark:text-muted dark:hover:bg-neutral-700"
        >
          <Sparkles className="h-3 w-3 text-amber-500" />
          <code className="text-xs">{rec.toolName}</code>
        </button>
      ))}
    </div>
  )
}

//=============================================================================
// Project Type Badge Component
//=============================================================================

