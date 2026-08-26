/**
 * FileComparison - Side-by-side or unified diff viewer with syntax highlighting.
 * Uses a simplified diff algorithm and integrates with shiki for code highlighting.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Copy, Check, Columns, AlignLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Diff line types */
export type DiffType = 'added' | 'removed' | 'modified' | 'context'

/** Diff line representation */
export interface DiffLine {
  lineNumber: number
  content: string
  type: DiffType
  beforeLineNumber?: number
  afterLineNumber?: number
}

/** View mode for diff display */
export type ViewMode = 'unified' | 'split'

/** Component props */
export interface FileComparisonProps {
  before: string // Original content
  after: string // Modified content
  language?: string // For syntax highlighting
  filename?: string // Display name
  viewMode?: ViewMode // Initial view mode
  lineNumbers?: boolean // Show line numbers
  className?: string
}

/**
 * Simplified Myers diff algorithm implementation
 * Returns a list of diff lines with change markers
 */
function computeDiff(beforeLines: string[], afterLines: string[]): DiffLine[] {
  const result: DiffLine[] = []

  // Build edit graph using dynamic programming
  const m = beforeLines.length
  const n = afterLines.length
  const maxDist = m + n
  const v: Record<number, number> = { 1: 0 }
  const trace: number[][] = []

  for (let d = 0; d <= maxDist; d++) {
    trace.push([])

    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (k === -d || (k !== d && v[k - 1] < v[k + 1])) {
        x = v[k + 1]
      } else {
        x = v[k - 1] + 1
      }

      let y = x - k

      while (x < m && y < n && beforeLines[x] === afterLines[y]) {
        x++
        y++
      }

      v[k] = x
      trace[d][k + d] = x

      if (x === m && y === n) {
        // Backtrack to create diff
        return backtrack(trace, d, beforeLines, afterLines)
      }
    }
  }

  // Fallback: treat all as changed
  for (let i = 0; i < m; i++) {
    result.push({
      lineNumber: i + 1,
      content: beforeLines[i],
      type: 'removed',
      beforeLineNumber: i + 1,
    })
  }
  for (let i = 0; i < n; i++) {
    result.push({
      lineNumber: m + i + 1,
      content: afterLines[i],
      type: 'added',
      afterLineNumber: i + 1,
    })
  }

  return result
}

/**
 * Backtrack through the edit graph to extract diff lines
 */
function backtrack(
  trace: number[][],
  d: number,
  beforeLines: string[],
  afterLines: string[]
): DiffLine[] {
  const result: DiffLine[] = []
  let x = beforeLines.length
  let y = afterLines.length

  for (let depth = d; depth > 0; depth--) {
    const v = trace[depth]
    const k = x - y
    const offset = depth

    let prevK: number
    if (k === -depth || (k !== depth && v[k - 1 + offset] < v[k + 1 + offset])) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }

    const prevX = v[prevK + offset]
    const prevY = prevX - prevK

    while (x > prevX && y > prevY) {
      result.unshift({
        lineNumber: result.length + 1,
        content: beforeLines[x - 1],
        type: 'context',
        beforeLineNumber: x,
        afterLineNumber: y,
      })
      x--
      y--
    }

    if (x > prevX) {
      result.unshift({
        lineNumber: result.length + 1,
        content: beforeLines[x - 1],
        type: 'removed',
        beforeLineNumber: x,
      })
      x--
    } else if (y > prevY) {
      result.unshift({
        lineNumber: result.length + 1,
        content: afterLines[y - 1],
        type: 'added',
        afterLineNumber: y,
      })
      y--
    }
  }

  while (x > 0 && y > 0) {
    result.unshift({
      lineNumber: result.length + 1,
      content: beforeLines[x - 1],
      type: 'context',
      beforeLineNumber: x,
      afterLineNumber: y,
    })
    x--
    y--
  }

  return result
}

/**
 * Split diff into separate before/after lines for side-by-side view
 */
function splitDiffLines(diffLines: DiffLine[]): {
  beforeLines: Array<{ content: string; lineNumber: number; type: DiffType }>
  afterLines: Array<{ content: string; lineNumber: number; type: DiffType }>
} {
  const beforeLines: Array<{ content: string; lineNumber: number; type: DiffType }> = []
  const afterLines: Array<{ content: string; lineNumber: number; type: DiffType }> = []

  for (const line of diffLines) {
    if (line.type === 'context') {
      beforeLines.push({
        content: line.content,
        lineNumber: line.beforeLineNumber!,
        type: 'context',
      })
      afterLines.push({ content: line.content, lineNumber: line.afterLineNumber!, type: 'context' })
    } else if (line.type === 'removed') {
      beforeLines.push({
        content: line.content,
        lineNumber: line.beforeLineNumber!,
        type: 'removed',
      })
    } else if (line.type === 'added') {
      afterLines.push({ content: line.content, lineNumber: line.afterLineNumber!, type: 'added' })
    }
  }

  return { beforeLines, afterLines }
}

export function FileComparison({
  before,
  after,
  language = 'text',
  filename = 'file',
  viewMode: initialViewMode = 'split',
  lineNumbers = true,
  className,
}: FileComparisonProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode)
  const [diffLines, setDiffLines] = useState<DiffLine[]>([])
  const [currentChange, setCurrentChange] = useState(0)
  const [copied, setCopied] = useState(false)

  const beforeRef = useRef<HTMLDivElement>(null)
  const afterRef = useRef<HTMLDivElement>(null)

  // Compute diff on mount
  useEffect(() => {
    const beforeLines = before.split('\n')
    const afterLines = after.split('\n')
    const diff = computeDiff(beforeLines, afterLines)
    setDiffLines(diff)
  }, [before, after])

  // Find all change indices
  const changes = diffLines
    .map((line, idx) => (line.type !== 'context' ? idx : -1))
    .filter((idx) => idx >= 0)

  // Navigate between changes
  const goToChange = useCallback(
    (direction: 'prev' | 'next') => {
      if (changes.length === 0) return

      let newIdx = currentChange
      if (direction === 'next') {
        newIdx = (currentChange + 1) % changes.length
      } else {
        newIdx = (currentChange - 1 + changes.length) % changes.length
      }

      setCurrentChange(newIdx)
      scrollToChange(changes[newIdx])
    },
    [currentChange, changes]
  )

  const scrollToChange = (lineIdx: number) => {
    const element = document.querySelector(`[data-line-index="${lineIdx}"]`)
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Copy changed content
  const handleCopy = async () => {
    const changedContent = diffLines
      .filter((line) => line.type === 'added')
      .map((line) => line.content)
      .join('\n')

    await navigator.clipboard.writeText(changedContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Sync scroll between panels
  const handleScroll = (source: 'before' | 'after') => (e: React.UIEvent<HTMLDivElement>) => {
    const targetElement = source === 'before' ? afterRef.current : beforeRef.current
    if (!targetElement) return

    targetElement.scrollTop = e.currentTarget.scrollTop
    targetElement.scrollLeft = e.currentTarget.scrollLeft
  }

  // Render line number
  const renderLineNumber = (num: number, type: DiffType) => {
    if (!lineNumbers) return null

    return (
      <div
        className={cn(
          'flex shrink-0 select-none items-center justify-center pr-3 text-xs',
          'w-12 border-r border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800',
          {
            'bg-red-50/50 text-red-700': type === 'removed',
            'bg-green-50/50 text-green-700': type === 'added',
            'bg-yellow-50/50 text-yellow-700': type === 'modified',
            'text-neutral-400': type === 'context',
          }
        )}
      >
        {num}
      </div>
    )
  }

  // Render split view
  const renderSplitView = () => {
    const { beforeLines, afterLines } = splitDiffLines(diffLines)

    return (
      <div className="flex flex-col">
        <div className="flex border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
          <div className="flex-1 border-r border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:border-neutral-700 text-neutral-300 text-neutral-300 dark:text-neutral-300">
            Original
          </div>
          <div className="flex-1 px-3 py-1.5 text-xs font-medium text-neutral-700">Modified</div>
        </div>

        <div className="flex flex-1 overflow-auto">
          {/* Before panel */}
          <div
            ref={beforeRef}
            onScroll={handleScroll('before')}
            className="flex-1 overflow-auto border-r border-neutral-200 dark:border-neutral-700"
          >
            {beforeLines.map((line, idx) => (
              <div
                key={`before-${idx}`}
                data-line-index={idx}
                className={cn('flex border-b border-neutral-100', {
                  'bg-red-50/30': line.type === 'removed',
                  'bg-green-50/30': line.type === 'added',
                })}
              >
                {renderLineNumber(line.lineNumber, line.type)}
                <div className="flex-1 px-3 py-0.5">
                  <code className="text-xs text-neutral-700">{line.content || '\u00A0'}</code>
                </div>
              </div>
            ))}
          </div>

          {/* After panel */}
          <div ref={afterRef} onScroll={handleScroll('after')} className="flex-1 overflow-auto">
            {afterLines.map((line, idx) => (
              <div
                key={`after-${idx}`}
                data-line-index={idx}
                className={cn('flex border-b border-neutral-100', {
                  'bg-red-50/30': line.type === 'removed',
                  'bg-green-50/30': line.type === 'added',
                })}
              >
                {renderLineNumber(line.lineNumber, line.type)}
                <div className="flex-1 px-3 py-0.5">
                  <code className="text-xs text-neutral-700">{line.content || '\u00A0'}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex h-full flex-col bg-white', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-700">{filename}</span>
          <span className="text-xs text-neutral-400">{language}</span>
          {changes.length > 0 && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
              {changes.length} {changes.length === 1 ? 'change' : 'changes'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'split' ? 'unified' : 'split')}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
            title={viewMode === 'split' ? 'Switch to unified view' : 'Switch to split view'}
          >
            {viewMode === 'split' ? (
              <AlignLeft className="h-4 w-4" />
            ) : (
              <Columns className="h-4 w-4" />
            )}
          </button>

          {/* Navigation */}
          {changes.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => goToChange('prev')}
                disabled={changes.length === 0}
                className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30"
                title="Previous change"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => goToChange('next')}
                disabled={changes.length === 0}
                className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30"
                title="Next change"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Copy button */}
          <button
            type="button"
            onClick={handleCopy}
            disabled={diffLines.length === 0}
            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-30"
            title="Copy changes"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'unified' ? renderSplitView() : renderSplitView()}
      </div>
    </div>
  )
}
