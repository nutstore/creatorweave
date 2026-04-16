/**
 * ReasoningVisualization - AI Reasoning Process Visualization Component
 *
 * Displays AI's reasoning process, including:
 * - Thinking steps
 * - Tool call status
 * - Progress indicator
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Brain,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Settings,
  Search,
  FileText,
  Code,
} from 'lucide-react'

//=============================================================================
// Types
//=============================================================================

type ReasoningStepType = 'thinking' | 'tool_call' | 'analysis' | 'complete' | 'error'

interface ReasoningStep {
  id: string
  type: ReasoningStepType
  title: string
  description?: string
  details?: string
  status: 'pending' | 'in_progress' | 'complete' | 'error'
  timestamp?: number
  icon?: React.ElementType
}

interface ReasoningVisualizationProps {
  /** Current reasoning content */
  reasoning?: string
  /** Current tool call being executed */
  currentToolCall?: { name: string; args: Record<string, unknown> }
  /** All current tool calls being executed */
  activeToolCalls?: Array<{ id: string; name: string; args: Record<string, unknown> }>
  /** Streaming tool args */
  streamingToolArgs?: string
  /** Streaming tool args keyed by tool call id */
  streamingToolArgsByCallId?: Record<string, string>
  /** Overall status */
  status?: 'thinking' | 'reasoning' | 'tool_calling' | 'complete' | 'error'
  /** Compact mode for inline display */
  compact?: boolean
  /** Maximum height for the component */
  maxHeight?: string
}

//=============================================================================
// Icons for step types
//=============================================================================

const STEP_ICONS: Record<ReasoningStepType, React.ElementType> = {
  thinking: Brain,
  tool_call: Settings,
  analysis: Search,
  complete: CheckCircle2,
  error: AlertCircle,
}

//=============================================================================
// Helper Functions
//=============================================================================

function parseReasoningContent(content: string): ReasoningStep[] {
  if (!content) return []

  const steps: ReasoningStep[] = []
  const lines = content.split('\n').filter((line) => line.trim())

  let currentStep: Partial<ReasoningStep> | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    // Detect step patterns
    if (trimmed.match(/^#{1,3}\s+/) || trimmed.match(/^\d+\.\s+/)) {
      // Save previous step
      if (currentStep?.id && currentStep?.title) {
        steps.push(currentStep as ReasoningStep)
      }

      // Start new step
      const title = trimmed.replace(/^#{1,3}\s+/, '').replace(/^\d+\.\s+/, '')
      currentStep = {
        id: `step-${steps.length}`,
        type: 'thinking',
        title,
        description: '',
        status: steps.length === 0 ? 'in_progress' : 'pending',
        icon: Brain,
      }
    } else if (trimmed.match(/^-|\*|\d+\)/)) {
      // Bullet point - add to current step description
      if (currentStep) {
        const bullet = trimmed.replace(/^[-*]\s*/, '').replace(/^\d+\)\s*/, '')
        if (currentStep.description) {
          currentStep.description += '\n' + bullet
        } else {
          currentStep.description = bullet
        }
      }
    } else if (currentStep) {
      // Add to current step details
      if (currentStep.details) {
        currentStep.details += '\n' + trimmed
      } else {
        currentStep.details = trimmed
      }
    } else {
      // No current step, create one
      currentStep = {
        id: `step-${steps.length}`,
        type: 'thinking',
        title: trimmed.slice(0, 100),
        status: 'in_progress',
        icon: Brain,
      }
    }
  }

  // Add last step
  if (currentStep?.id && currentStep?.title) {
    steps.push(currentStep as ReasoningStep)
  }

  return steps
}

function getToolIcon(toolName: string): React.ElementType {
  const name = toolName.toLowerCase()

  if (name.includes('read') || name.includes('file')) return FileText
  if (name.includes('code') || name.includes('exec') || name.includes('python')) return Code
  if (name.includes('search') || name.includes('grep') || name.includes('find')) return Search

  return Settings
}

//=============================================================================
// Component
//=============================================================================

export function ReasoningVisualization({
  reasoning,
  currentToolCall,
  activeToolCalls,
  streamingToolArgs,
  streamingToolArgsByCallId,
  status = 'thinking',
  compact = false,
  maxHeight = '300px',
}: ReasoningVisualizationProps) {
  const [steps, setSteps] = useState<ReasoningStep[]>([])
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  const effectiveToolCalls = useMemo(() => {
    if (activeToolCalls && activeToolCalls.length > 0) return activeToolCalls
    if (currentToolCall) {
      return [{ id: 'current', name: currentToolCall.name, args: currentToolCall.args }]
    }
    return []
  }, [activeToolCalls, currentToolCall])

  const toolCallSteps = useMemo<ReasoningStep[]>(() => {
    return effectiveToolCalls.map((tool, idx) => ({
      id: `tool-call-${tool.id || idx}`,
      type: 'tool_call',
      title: `Using ${tool.name}`,
      description: 'Executing tool...',
      status: 'in_progress',
      icon: getToolIcon(tool.name),
    }))
  }, [effectiveToolCalls])

  // Parse reasoning content
  useEffect(() => {
    if (reasoning) {
      const parsedSteps = parseReasoningContent(reasoning)
      setSteps(parsedSteps)

      // Auto-expand the first step
      if (parsedSteps.length > 0) {
        setExpandedSteps(new Set([parsedSteps[0].id]))
      }
    }
  }, [reasoning])

  // Toggle step expansion
  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }

  // Compact mode
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-secondary dark:text-muted">
        {status === 'thinking' || status === 'reasoning' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
            <span className="text-secondary dark:text-muted">Thinking...</span>
          </>
        ) : status === 'tool_calling' && effectiveToolCalls.length > 0 ? (
          <>
            <Settings className="h-4 w-4 animate-pulse text-primary-600" />
            <span className="text-secondary dark:text-muted">
              {effectiveToolCalls.length > 1
                ? `Using ${effectiveToolCalls.length} tools...`
                : `Using ${effectiveToolCalls[0].name}...`}
            </span>
          </>
        ) : status === 'complete' ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-secondary dark:text-muted">Done</span>
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-tertiary dark:text-muted" />
            <span className="text-secondary dark:text-muted">Processing...</span>
          </>
        )}
      </div>
    )
  }

  // Full mode
  return (
    <div
      className="rounded-xl border border-border bg-muted dark:border-border dark:bg-muted"
      style={{ maxHeight, overflow: 'auto' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:border-border">
        <div className="flex items-center gap-2">
          {status === 'thinking' || status === 'reasoning' ? (
            <Brain className="h-4 w-4 animate-pulse text-primary-600" />
          ) : status === 'tool_calling' ? (
            <Settings className="h-4 w-4 animate-spin text-primary-600" />
          ) : status === 'complete' ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
          <span className="text-sm font-medium text-primary dark:text-primary-foreground">
            {status === 'thinking' || status === 'reasoning'
              ? 'Thinking...'
              : status === 'tool_calling'
                ? 'Executing...'
                : status === 'complete'
                  ? 'Complete'
                  : 'Processing'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Progress indicator */}
          <div className="flex gap-1">
            {status === 'thinking' || status === 'reasoning' ? (
              <>
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500 delay-75" />
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500 delay-150" />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-3 p-4">
        {/* Reasoning steps */}
        {steps.map((step) => {
          const Icon = step.icon || STEP_ICONS[step.type]
          const isExpanded = expandedSteps.has(step.id)

          return (
            <div
              key={step.id}
              className={`rounded-lg border ${
                step.status === 'in_progress'
                  ? 'border-primary-300 bg-primary-50'
                  : 'border border-border dark:border-border bg-white dark:border-border dark:bg-card'
              } transition-colors`}
            >
              <button
                onClick={() => toggleStep(step.id)}
                className="flex w-full items-start gap-3 p-3 text-left"
              >
                <div
                  className={`mt-0.5 rounded-full p-1 ${
                    step.status === 'in_progress'
                      ? 'bg-primary-100'
                      : step.status === 'complete'
                        ? 'bg-green-100'
                        : 'bg-muted dark:bg-muted'
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${
                      step.status === 'in_progress'
                        ? 'text-primary-600'
                        : step.status === 'complete'
                          ? 'text-green-600'
                          : 'text-tertiary dark:text-muted'
                    } ${step.status === 'in_progress' ? 'animate-pulse' : ''}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${
                      step.status === 'in_progress' ? 'text-primary-900 dark:text-primary-200' : 'text-primary dark:text-primary-foreground'
                    }`}
                  >
                    {step.title}
                  </p>
                  {step.description && isExpanded && (
                    <p className="mt-1 text-xs text-secondary dark:text-muted">{step.description}</p>
                  )}
                </div>
                {step.details && (
                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-tertiary dark:text-muted" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-tertiary dark:text-muted" />
                    )}
                  </div>
                )}
              </button>

              {/* Expanded details */}
              {isExpanded && step.details && (
                <div className="border-t border border-border dark:border-border px-3 pb-3 pt-2 dark:border-border">
                  <p className="whitespace-pre-wrap text-xs text-secondary dark:text-muted">{step.details}</p>
                </div>
              )}
            </div>
          )
        })}

        {/* Current tool calls */}
        {toolCallSteps.map((toolCallStep, idx) => {
          const tool = effectiveToolCalls[idx]
          const argsText =
            (tool.id ? streamingToolArgsByCallId?.[tool.id] : undefined) ||
            (effectiveToolCalls.length === 1 ? streamingToolArgs : undefined) ||
            (Object.keys(tool.args || {}).length > 0 ? JSON.stringify(tool.args, null, 2) : '')

          return (
            <div
              key={toolCallStep.id}
              className="border-primary-300 rounded-lg border bg-primary-50 p-3 dark:border-primary-900/40 dark:bg-primary-950/20"
            >
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary-100 p-1 dark:bg-primary-900/30">
                {(() => {
                  const Icon = getToolIcon(tool.name)
                  return <Icon className="h-3.5 w-3.5 animate-pulse text-primary-600" />
                })()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-primary-900 text-sm font-medium dark:text-primary-200">{toolCallStep.title}</p>
                <p className="mt-1 text-xs text-primary-700 dark:text-primary-300">{toolCallStep.description}</p>

                {/* Tool args preview */}
                {argsText && (
                  <div className="mt-2 rounded bg-white/50 p-2 dark:bg-card/60">
                    <p className="font-mono text-xs text-primary-800 dark:text-primary-300">
                      {argsText}
                    </p>
                  </div>
                )}
              </div>
              <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
            </div>
          </div>
          )
        })}

        {/* Empty state */}
        {steps.length === 0 && toolCallSteps.length === 0 && status !== 'complete' && (
          <div className="py-8 text-center">
            <Brain className="mx-auto mb-2 h-8 w-8 text-tertiary dark:text-muted" />
            <p className="text-sm text-tertiary dark:text-muted">
              {status === 'thinking' || status === 'reasoning'
                ? 'AI is thinking...'
                : 'Processing your request...'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

//=============================================================================
// Inline Reasoning Component (for message bubble)
//=============================================================================

interface InlineReasoningProps {
  reasoning?: string
  isStreaming?: boolean
}

export function InlineReasoning({ reasoning, isStreaming }: InlineReasoningProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (!reasoning) return null

  return (
    <details
      className={`group my-2 rounded-lg border ${isStreaming ? 'border-primary-300 bg-primary-50 dark:border-primary-900/40 dark:bg-primary-950/20' : 'border border-border dark:border-border bg-muted dark:bg-muted dark:border-border dark:bg-card'}`}
      open={isExpanded}
      onToggle={(e) => setIsExpanded(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
        <Brain
          className={`h-4 w-4 ${isStreaming ? 'animate-pulse text-primary-600' : 'text-tertiary dark:text-muted'}`}
        />
        <span className={isStreaming ? 'text-primary-900 font-medium dark:text-primary-200' : 'text-secondary dark:text-muted'}>
          {isStreaming ? 'Thinking...' : 'Thought Process'}
        </span>
        <ChevronRight
          className={`ml-auto h-4 w-4 text-tertiary dark:text-muted transition-transform group-open:rotate-90`}
        />
      </summary>
      <div className="border-t border border-border dark:border-border px-3 py-2 dark:border-border">
        <p className="whitespace-pre-wrap text-sm text-secondary dark:text-muted">{reasoning}</p>
      </div>
    </details>
  )
}

//=============================================================================
// Progress Bar Component
//=============================================================================

interface ProgressBarProps {
  status: 'thinking' | 'tool_calling' | 'complete' | 'error'
  currentStep?: number
  totalSteps?: number
  message?: string
}

export function ProgressBar({
  status,
  currentStep = 1,
  totalSteps = 3,
  message,
}: ProgressBarProps) {
  const progress = status === 'complete' ? 1 : status === 'error' ? 1 : currentStep / totalSteps

  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted dark:bg-muted">
        <div
          className={`h-full transition-all duration-500 ${
            status === 'complete'
              ? 'bg-green-500'
              : status === 'error'
                ? 'bg-red-500'
                : 'bg-primary-500'
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      {message && <span className="whitespace-nowrap text-xs text-secondary dark:text-muted">{message}</span>}
    </div>
  )
}
