/**
 * LazyDiffViewer Component
 *
 * A lightweight diff viewer that only renders changed hunks by default.
 * Users can expand context lines above/below each hunk via "Load more" buttons.
 * Supports line comments — click line numbers to select lines for commenting.
 *
 * The diff is computed using a built-in LCS algorithm (no external dependency).
 * Hunks contain ONLY changed lines (added/removed); context lines are rendered
 * separately from the original file content.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@/i18n'
import { ChevronDown, ChevronUp, Columns2, UnfoldVertical, Code, MessageSquare } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@creatorweave/ui'

// ── Types ──────────────────────────────────────────────────────────────────

/** A single changed line within a hunk */
interface DiffLine {
  type: 'added' | 'removed'
  content: string
  /** 1-based line number in original file (only for removed lines) */
  oldLineNo?: number
  /** 1-based line number in modified file (only for added lines) */
  newLineNo?: number
}

/** A contiguous group of changes */
interface DiffHunk {
  /** Unique id for React keys */
  id: string
  /** The changed lines (added/removed only, no context) */
  lines: DiffLine[]
  /**
   * First changed line in the original file (1-based).
   * For add-only hunks, this is the line after which lines were inserted.
   */
  origStartLine: number
  /**
   * Last changed line in the original file (1-based).
   * For add-only hunks where origStartLine == origEndLine, the insert
   * happened after origStartLine.
   */
  origEndLine: number
  /** First changed line in the modified file (1-based) */
  modStartLine: number
  /** Last changed line in the modified file (1-based) */
  modEndLine: number
}

/** A comment target passed from the parent */
interface LineComment {
  side: 'original' | 'modified'
  startLine: number
  endLine: number
}

interface LazyDiffViewerProps {
  original: string
  modified: string
  path: string
  /** Number of context lines to show around each hunk initially */
  defaultContext?: number
  /** Number of additional lines to load per click */
  contextStep?: number
  /** When user wants full Monaco editor, call this */
  onSwitchToMonaco?: () => void
  /** Current split-view state (for toggle button) */
  isSplitView?: boolean
  /** Toggle split view callback */
  onToggleSplitView?: () => void
  /** Active comments for this file */
  comments?: LineComment[]
  /** Currently selected target for comment composer */
  selectedTarget?: {
    side: 'original' | 'modified'
    startLine: number
    endLine: number
  } | null
  /** Called when user clicks a line number to start composing a comment */
  onLineSelectForComment?: (target: {
    side: 'original' | 'modified'
    startLine: number
    endLine: number
  }) => void
}

// ── Diff Computation ───────────────────────────────────────────────────────

interface LineChange {
  type: 'equal' | 'removed' | 'added'
  value: string[]
  count: number
}

/**
 * Compute diff hunks from two strings.
 * Returns an array of hunks containing ONLY changed lines (no context).
 */
function computeDiffHunks(original: string, modified: string): DiffHunk[] {
  const oldLines = original.split('\n')
  const newLines = modified.split('\n')
  const changes = computeLineDiff(oldLines, newLines)

  const hunks: DiffHunk[] = []
  let currentLines: DiffLine[] = []
  let hunkOrigStart = 0
  let hunkOrigEnd = 0
  let hunkModStart = 0
  let hunkModEnd = 0
  let inHunk = false
  let origLine = 1
  let modLine = 1

  const flushHunk = () => {
    if (currentLines.length > 0) {
      hunks.push({
        id: `hunk-${hunkOrigStart}-${hunkModStart}`,
        lines: currentLines,
        origStartLine: hunkOrigStart,
        origEndLine: hunkOrigEnd,
        modStartLine: hunkModStart,
        modEndLine: hunkModEnd,
      })
    }
    currentLines = []
    inHunk = false
  }

  for (const change of changes) {
    if (change.type === 'equal') {
      if (inHunk) {
        flushHunk()
      }
      origLine += change.count
      modLine += change.count
    } else if (change.type === 'removed') {
      if (!inHunk) {
        inHunk = true
        hunkOrigStart = origLine
        hunkModStart = modLine
      }
      for (let i = 0; i < change.count; i++) {
        currentLines.push({
          type: 'removed',
          content: change.value[i],
          oldLineNo: origLine,
        })
        origLine++
      }
      hunkOrigEnd = origLine - 1
      hunkModEnd = modLine - 1
    } else if (change.type === 'added') {
      if (!inHunk) {
        inHunk = true
        // For insert-only hunks, the "start" is the position just before
        hunkOrigStart = origLine
        hunkOrigEnd = origLine > 0 ? origLine - 1 : 0
        hunkModStart = modLine
      }
      for (let i = 0; i < change.count; i++) {
        currentLines.push({
          type: 'added',
          content: change.value[i],
          newLineNo: modLine,
        })
        modLine++
      }
      hunkModEnd = modLine - 1
      // If only added lines (no removed), origEnd = origStart - 1
      if (hunkOrigEnd < hunkOrigStart && !currentLines.some((l) => l.type === 'removed')) {
        hunkOrigEnd = hunkOrigStart > 0 ? hunkOrigStart - 1 : 0
      }
    }
  }

  // Flush any remaining hunk
  flushHunk()

  return hunks
}

/**
 * LCS-based line diff. O(N*M) time & space, with fallback for large files.
 */
function computeLineDiff(oldLines: string[], newLines: string[]): LineChange[] {
  const m = oldLines.length
  const n = newLines.length

  // For very large files, use a simpler approach
  if (m * n > 5_000_000) {
    return simpleLineDiff(oldLines, newLines)
  }

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find diff
  type SimpleChange = { type: 'equal' | 'removed' | 'added'; line: string }
  const changes: SimpleChange[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      changes.push({ type: 'equal', line: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      changes.push({ type: 'added', line: newLines[j - 1] })
      j--
    } else {
      changes.push({ type: 'removed', line: oldLines[i - 1] })
      i--
    }
  }

  changes.reverse()

  // Merge consecutive same-type changes
  const result: LineChange[] = []
  for (const change of changes) {
    const last = result[result.length - 1]
    if (last && last.type === change.type) {
      last.value.push(change.line)
      last.count++
    } else {
      result.push({
        type: change.type,
        value: [change.line],
        count: 1,
      })
    }
  }

  return result
}

/**
 * Simple O(N+M) diff for large files — finds common prefix/suffix,
 * treats the middle as one big replace block.
 */
function simpleLineDiff(oldLines: string[], newLines: string[]): LineChange[] {
  const result: LineChange[] = []
  let prefixLen = 0
  const minLen = Math.min(oldLines.length, newLines.length)
  while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++
  }

  let suffixLen = 0
  while (
    suffixLen < minLen - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  if (prefixLen > 0) {
    result.push({ type: 'equal', value: oldLines.slice(0, prefixLen), count: prefixLen })
  }

  const removedEnd = oldLines.length - suffixLen
  const addedEnd = newLines.length - suffixLen

  if (removedEnd > prefixLen) {
    result.push({ type: 'removed', value: oldLines.slice(prefixLen, removedEnd), count: removedEnd - prefixLen })
  }
  if (addedEnd > prefixLen) {
    result.push({ type: 'added', value: newLines.slice(prefixLen, addedEnd), count: addedEnd - prefixLen })
  }

  if (suffixLen > 0) {
    result.push({ type: 'equal', value: oldLines.slice(oldLines.length - suffixLen), count: suffixLen })
  }

  return result
}

/** Check if a line number falls within any comment range */
function isLineCommented(
  side: 'original' | 'modified',
  lineNo: number,
  comments: LineComment[],
): boolean {
  return comments.some(
    (c) => c.side === side && lineNo >= c.startLine && lineNo <= c.endLine,
  )
}

/** Check if a line number falls within the selected target range */
function isLineSelected(
  side: 'original' | 'modified',
  lineNo: number,
  target: { side: 'original' | 'modified'; startLine: number; endLine: number } | null | undefined,
): boolean {
  if (!target || target.side !== side) return false
  return lineNo >= target.startLine && lineNo <= target.endLine
}

// ── Component ──────────────────────────────────────────────────────────────

const LazyDiffViewer: React.FC<LazyDiffViewerProps> = ({
  original,
  modified,
  path,
  defaultContext = 3,
  contextStep = 10,
  onSwitchToMonaco,
  isSplitView = false,
  onToggleSplitView,
  comments = [],
  selectedTarget = null,
  onLineSelectForComment,
}) => {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)

  // Multi-line selection: track anchor line per side (like Monaco's Shift+Click)
  const anchorRef = useRef<Record<'original' | 'modified', number | null>>({ original: null, modified: null })

  // Context expansion state: hunkIndex -> { above: number, below: number }
  const [expandedContext, setExpandedContext] = useState<Record<number, { above: number; below: number }>>({})

  // Compute hunks and line arrays
  const hunks = useMemo(() => computeDiffHunks(original, modified), [original, modified])
  const oldLines = useMemo(() => original.split('\n'), [original])

  // Reset context when file changes
  useEffect(() => {
    setExpandedContext({})
  }, [path])

  const expandContext = useCallback((hunkIndex: number, direction: 'above' | 'below') => {
    setExpandedContext((prev) => {
      const current = prev[hunkIndex] ?? { above: defaultContext, below: defaultContext }
      return {
        ...prev,
        [hunkIndex]: {
          ...current,
          [direction]: current[direction] + contextStep,
        },
      }
    })
  }, [defaultContext, contextStep])

  // For each hunk, compute the range of context lines available above and below
  const hunkContextRanges = useMemo(() => {
    return hunks.map((hunk, idx) => {
      const prevHunk = idx > 0 ? hunks[idx - 1] : null
      const nextHunk = idx < hunks.length - 1 ? hunks[idx + 1] : null

      // Context above: lines from end of previous hunk to start of this hunk
      const prevEndOrig = prevHunk ? prevHunk.origEndLine : 0
      const aboveStart = prevEndOrig + 1  // 1-based, inclusive
      const aboveEnd = hunk.origStartLine - 1  // 1-based, inclusive
      const availableAbove = Math.max(0, aboveEnd - aboveStart + 1)

      // Context below: lines from end of this hunk to start of next hunk
      const nextStartOrig = nextHunk ? nextHunk.origStartLine : oldLines.length + 1
      const belowStart = hunk.origEndLine + 1  // 1-based, inclusive
      const belowEnd = nextStartOrig - 1  // 1-based, inclusive
      const availableBelow = Math.max(0, belowEnd - belowStart + 1)

      return {
        aboveStart,   // 1-based first line of context above
        aboveEnd,     // 1-based last line of context above
        belowStart,   // 1-based first line of context below
        belowEnd,     // 1-based last line of context below
        availableAbove,
        availableBelow,
      }
    })
  }, [hunks, oldLines.length])

  // Stats
  const stats = useMemo(() => {
    let additions = 0
    let deletions = 0
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'added') additions++
        else if (line.type === 'removed') deletions++
      }
    }
    return { additions, deletions, hunks: hunks.length }
  }, [hunks])

  // ── Render helpers ─────────────────────────────────────────────────────

  function renderToolbar() {
    return (
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-subtle bg-neutral-50/50 px-2 dark:bg-neutral-900/50">
        <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
          {stats.hunks === 1
            ? t('sidebar.lazyDiffViewer.oneChangeBlock', { additions: stats.additions, deletions: stats.deletions })
            : t('sidebar.lazyDiffViewer.changeBlocks', { count: stats.hunks, additions: stats.additions, deletions: stats.deletions })
          }
        </span>
        <div className="flex-1" />
        {onToggleSplitView && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleSplitView}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-300"
                >
                  {isSplitView ? <UnfoldVertical className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isSplitView ? t('sidebar.fileDiffViewer.mergeView') : t('sidebar.fileDiffViewer.splitView')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {onSwitchToMonaco && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onSwitchToMonaco}
                  className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-neutral-500 transition-colors hover:bg-neutral-200/60 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700/60 dark:hover:text-neutral-300"
                >
                  <Code className="h-3 w-3" />
                  {t('sidebar.lazyDiffViewer.fullEditor')}
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('sidebar.lazyDiffViewer.openInFullEditor')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    )
  }

  function renderLoadMoreButton(
    direction: 'above' | 'below',
    hunkIndex: number,
    remaining: number,
  ) {
    if (remaining <= 0) return null

    const loadCount = Math.min(contextStep, remaining)
    return (
      <button
        key={`load-${direction}-${hunkIndex}`}
        type="button"
        onClick={() => expandContext(hunkIndex, direction)}
        className="flex w-full items-center justify-center gap-1.5 py-1.5 text-[11px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
      >
        {direction === 'above' ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        {t('sidebar.lazyDiffViewer.loadMore', { count: loadCount })}
        <span className="text-neutral-300 dark:text-neutral-600">
          ({remaining} {t('sidebar.lazyDiffViewer.remaining')})
        </span>
      </button>
    )
  }

  /** Handle line number click with Shift+Click multi-line selection support */
  const handleLineClick = useCallback((
    side: 'original' | 'modified',
    lineNo: number,
    event: React.MouseEvent,
  ) => {
    if (!onLineSelectForComment) return
    const isShift = event.shiftKey

    if (isShift && anchorRef.current[side] !== null) {
      // Shift+Click: extend selection from anchor to current line
      const anchorLine = anchorRef.current[side]!
      const startLine = Math.min(anchorLine, lineNo)
      const endLine = Math.max(anchorLine, lineNo)
      onLineSelectForComment({ side, startLine, endLine })
    } else {
      // Normal click: set new anchor, single line selection
      anchorRef.current = { original: null, modified: null }
      anchorRef.current[side] = lineNo
      onLineSelectForComment({ side, startLine: lineNo, endLine: lineNo })
    }
  }, [onLineSelectForComment])

  /** Build the className for a line number cell, with comment/selection indicators */
  function lineNoClassName(
    side: 'original' | 'modified',
    lineNo: number,
    baseColor: string,
  ): string {
    const commented = isLineCommented(side, lineNo, comments)
    const selected = isLineSelected(side, lineNo, selectedTarget)
    const clickable = onLineSelectForComment

    let cls = `w-12 shrink-0 select-none text-right pr-3 font-mono text-[13px] leading-[20px] ${baseColor}`
    if (clickable) {
      cls += ' cursor-pointer hover:bg-neutral-200/80 dark:hover:bg-neutral-700/80'
    }
    if (commented) {
      cls += ' !text-amber-500 dark:!text-amber-400 font-bold'
    }
    if (selected) {
      cls += ' !bg-blue-100 !text-blue-600 dark:!bg-blue-900/40 dark:!text-blue-400'
    }
    return cls
  }

  /** Render context lines from the original file */
  function renderContextLines(
    direction: 'above' | 'below',
    hunkIndex: number,
  ) {
    const range = hunkContextRanges[hunkIndex]
    if (!range) return null

    const expanded = expandedContext[hunkIndex] ?? { above: defaultContext, below: defaultContext }
    const contextCount = direction === 'above'
      ? Math.min(expanded.above, range.availableAbove)
      : Math.min(expanded.below, range.availableBelow)

    if (contextCount <= 0) return null

    const lines: React.ReactNode[] = []
    if (direction === 'above') {
      const startLineNo = range.aboveEnd - contextCount + 1
      for (let lineNo = startLineNo; lineNo <= range.aboveEnd; lineNo++) {
        const idx = lineNo - 1
        if (idx < 0 || idx >= oldLines.length) continue
        const commented = isLineCommented('original', lineNo, comments) || isLineCommented('modified', lineNo, comments)
        const selected = isLineSelected('original', lineNo, selectedTarget) || isLineSelected('modified', lineNo, selectedTarget)
        lines.push(
          <div
            key={`ctx-above-${hunkIndex}-${lineNo}`}
            className={`flex font-mono text-[13px] leading-[20px] ${
              selected ? 'bg-blue-50 dark:bg-blue-950/20' : commented ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''
            }`}
          >
            <span
              className={lineNoClassName('original', lineNo, 'text-neutral-300 dark:text-neutral-600')}
              onClick={(e) => handleLineClick('original', lineNo, e)}
            >
              {lineNo}
            </span>
            <span
              className={lineNoClassName('modified', lineNo, 'text-neutral-300 dark:text-neutral-600')}
              onClick={(e) => handleLineClick('modified', lineNo, e)}
            >
              {lineNo}
            </span>
            <span className="w-5 shrink-0 select-none text-center text-neutral-300 dark:text-neutral-600">
              {commented && <MessageSquare className="inline h-2.5 w-2.5 text-amber-400 dark:text-amber-500" />}
            </span>
            <span className="whitespace-pre-wrap break-all text-neutral-500 dark:text-neutral-400">
              {oldLines[idx]}
            </span>
          </div>
        )
      }
    } else {
      const endLineNo = range.belowStart + contextCount - 1
      for (let lineNo = range.belowStart; lineNo <= endLineNo; lineNo++) {
        const idx = lineNo - 1
        if (idx < 0 || idx >= oldLines.length) continue
        const commented = isLineCommented('original', lineNo, comments) || isLineCommented('modified', lineNo, comments)
        const selected = isLineSelected('original', lineNo, selectedTarget) || isLineSelected('modified', lineNo, selectedTarget)
        lines.push(
          <div
            key={`ctx-below-${hunkIndex}-${lineNo}`}
            className={`flex font-mono text-[13px] leading-[20px] ${
              selected ? 'bg-blue-50 dark:bg-blue-950/20' : commented ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''
            }`}
          >
            <span
              className={lineNoClassName('original', lineNo, 'text-neutral-300 dark:text-neutral-600')}
              onClick={(e) => handleLineClick('original', lineNo, e)}
            >
              {lineNo}
            </span>
            <span
              className={lineNoClassName('modified', lineNo, 'text-neutral-300 dark:text-neutral-600')}
              onClick={(e) => handleLineClick('modified', lineNo, e)}
            >
              {lineNo}
            </span>
            <span className="w-5 shrink-0 select-none text-center text-neutral-300 dark:text-neutral-600">
              {commented && <MessageSquare className="inline h-2.5 w-2.5 text-amber-400 dark:text-amber-500" />}
            </span>
            <span className="whitespace-pre-wrap break-all text-neutral-500 dark:text-neutral-400">
              {oldLines[idx]}
            </span>
          </div>
        )
      }
    }

    return lines
  }

  function renderHunk(hunk: DiffHunk, hunkIndex: number) {
    const range = hunkContextRanges[hunkIndex]
    const expanded = expandedContext[hunkIndex] ?? { above: defaultContext, below: defaultContext }

    const showingAbove = Math.min(expanded.above, range.availableAbove)
    const showingBelow = Math.min(expanded.below, range.availableBelow)
    const remainingAbove = range.availableAbove - showingAbove
    const remainingBelow = range.availableBelow - showingBelow

    return (
      <div key={hunk.id} className="border-t border-subtle first:border-t-0">
        {/* Load more above */}
        {renderLoadMoreButton('above', hunkIndex, remainingAbove)}

        {/* Context above */}
        {renderContextLines('above', hunkIndex)}

        {/* Hunk header */}
        <div className="flex items-center bg-blue-50/50 px-2 py-0.5 font-mono text-[11px] text-blue-500 dark:bg-blue-950/20 dark:text-blue-400">
          <span className="opacity-60">
            @@ -{hunk.origStartLine},{hunk.origEndLine - hunk.origStartLine + 1} +{hunk.modStartLine},{hunk.modEndLine - hunk.modStartLine + 1} @@
          </span>
        </div>

        {/* Changed lines */}
        {hunk.lines.map((line, lineIdx) => {
          // Determine comment/selection state for this line
          const side = line.type === 'removed' ? 'original' : 'modified'
          const lineNo = line.type === 'removed' ? line.oldLineNo! : line.newLineNo!
          const commented = isLineCommented(side, lineNo, comments)
          const selected = isLineSelected(side, lineNo, selectedTarget)

          if (line.type === 'removed') {
            return (
              <div
                key={`line-${hunkIndex}-${lineIdx}`}
                className={`flex ${
                  selected
                    ? 'bg-blue-50 dark:bg-blue-950/30 ring-1 ring-inset ring-blue-300 dark:ring-blue-700'
                    : 'bg-red-50 dark:bg-red-950/20'
                }`}
              >
                <span
                  className={lineNoClassName('original', lineNo, 'text-red-300 dark:text-red-500/50')}
                  onClick={(e) => handleLineClick('original', lineNo, e)}
                >
                  {line.oldLineNo ?? ''}
                </span>
                <span
                  className="w-12 shrink-0 select-none text-right pr-3 font-mono text-[13px] leading-[20px] text-red-300 dark:text-red-500/50"
                />
                <span className="w-5 shrink-0 select-none text-center font-mono text-[13px] leading-[20px] text-red-400 dark:text-red-400">
                  {commented
                    ? <MessageSquare className="inline h-2.5 w-2.5 text-amber-500 dark:text-amber-400" />
                    : '−'
                  }
                </span>
                <span className="whitespace-pre-wrap break-all font-mono text-[13px] leading-[20px] text-red-700 dark:text-red-300">
                  {line.content}
                </span>
              </div>
            )
          }

          if (line.type === 'added') {
            return (
              <div
                key={`line-${hunkIndex}-${lineIdx}`}
                className={`flex ${
                  selected
                    ? 'bg-blue-50 dark:bg-blue-950/30 ring-1 ring-inset ring-blue-300 dark:ring-blue-700'
                    : 'bg-emerald-50 dark:bg-emerald-950/20'
                }`}
              >
                <span className="w-12 shrink-0 select-none text-right pr-3 font-mono text-[13px] leading-[20px] text-emerald-300 dark:text-emerald-500/50" />
                <span
                  className={lineNoClassName('modified', lineNo, 'text-emerald-300 dark:text-emerald-500/50')}
                  onClick={(e) => handleLineClick('modified', lineNo, e)}
                >
                  {line.newLineNo ?? ''}
                </span>
                <span className="w-5 shrink-0 select-none text-center font-mono text-[13px] leading-[20px] text-emerald-500 dark:text-emerald-400">
                  {commented
                    ? <MessageSquare className="inline h-2.5 w-2.5 text-amber-500 dark:text-amber-400" />
                    : '+'
                  }
                </span>
                <span className="whitespace-pre-wrap break-all font-mono text-[13px] leading-[20px] text-emerald-700 dark:text-emerald-300">
                  {line.content}
                </span>
              </div>
            )
          }

          return null
        })}

        {/* Context below */}
        {renderContextLines('below', hunkIndex)}

        {/* Load more below */}
        {renderLoadMoreButton('below', hunkIndex, remainingBelow)}
      </div>
    )
  }

  // No changes
  if (hunks.length === 0) {
    return (
      <div className="flex h-full flex-col">
        {renderToolbar()}
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-400 dark:text-neutral-500">
          {t('sidebar.lazyDiffViewer.noChanges')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {renderToolbar()}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-white dark:bg-neutral-900"
      >
        {hunks.map((hunk, idx) => renderHunk(hunk, idx))}
      </div>
    </div>
  )
}

export default LazyDiffViewer
