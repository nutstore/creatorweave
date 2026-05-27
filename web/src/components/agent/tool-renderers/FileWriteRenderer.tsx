/**
 * Renderer for `write` tool — file creation/overwrite with content preview.
 * Supports inline line comments (git-diff review style):
 *   - Click a line number to select it (single line)
 *   - Shift+Click another line number to extend selection (multi-line range)
 *   - Composer appears at the bottom to write a comment for the selected range
 *   - Multiple comments can be added, shown as tags at the bottom
 *   - "Send all comments" submits everything as one message to the AI
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FilePlus, ChevronDown, MessageSquarePlus, X, Send, MessageSquare, Maximize2, Minimize2 } from 'lucide-react'
import { CopyIconButton } from '../CopyIconButton'
import { useConversationActions } from '../ConversationActionContext'
import { registerRenderer } from './registry'
import type { ToolRenderCtx } from './types'

registerRenderer({
  name: 'write',
  icon: <FilePlus className="h-3.5 w-3.5 text-neutral-400" />,
  Summary(ctx) {
    const path = typeof ctx.args.path === 'string' ? ctx.args.path : undefined
    const content = typeof ctx.args.content === 'string' ? ctx.args.content : undefined
    const action = extractAction(ctx)
    const lineCount = content ? content.split('\n').length : 0

    return (
      <>
        <code className="font-medium text-neutral-700 dark:text-neutral-200">write</code>
        {path && (
          <span className="truncate text-neutral-400 dark:text-neutral-500">{shortPath(path)}</span>
        )}
        {!ctx.isStreaming && !ctx.isExecuting && (
          <span className="ml-auto flex items-center gap-1 text-xs text-neutral-400 shrink-0">
            {action ?? 'written'}
            {lineCount > 0 && <span>{lineCount} lines</span>}
          </span>
        )}
        {ctx.isStreaming && lineCount > 0 && (
          <span className="ml-auto text-xs text-neutral-400 shrink-0">{lineCount} lines…</span>
        )}
      </>
    )
  },
  Detail(ctx) {
    if (ctx.isError) {
      // Try to extract structured error info from envelope
      const envelope = ctx.result as Record<string, unknown> | undefined
      const errorObj = envelope?.error as Record<string, unknown> | undefined
      const metaObj = envelope?.meta as Record<string, unknown> | undefined
      const errMsg = typeof errorObj?.message === 'string'
        ? errorObj.message
        : typeof ctx.result?.error === 'string'
          ? ctx.result.error
          : 'Write failed'
      // hint can be in error.hint (from toolErrorJson) or meta.hint
      const hint = typeof errorObj?.hint === 'string'
        ? errorObj.hint
        : typeof metaObj?.hint === 'string'
          ? metaObj.hint
          : undefined

      return (
        <div className="px-3 py-2">
          <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-2 text-xs text-red-600 dark:text-red-400">
            {errMsg}
          </div>
          {hint && (
            <div className="mt-1.5 rounded-md bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-100 dark:border-neutral-700 p-2 text-xs text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap font-mono">
              {hint}
            </div>
          )}
        </div>
      )
    }

    const path = typeof ctx.args.path === 'string' ? ctx.args.path : undefined
    const content = typeof ctx.args.content === 'string' ? ctx.args.content : undefined

    if (!content) {
      if (ctx.isExecuting || ctx.isStreaming) return <StreamingPlaceholder />
      return <div className="px-3 py-2 text-xs text-neutral-400">No content</div>
    }

    return (
      <ContentPreview singlePath={path} content={content} isStreaming={ctx.isStreaming} />
    )
  },
})

function extractAction(ctx: ToolRenderCtx): string | undefined {
  const data = ctx.result?.data as Record<string, unknown> | undefined
  if (data && typeof data.action === 'string') {
    return data.action === 'create' ? 'new file' : data.action === 'modify' ? 'overwritten' : data.action
  }
  return undefined
}

// ── Comment type ──────────────────────────────────────────────────

interface LineComment {
  id: string
  startLine: number
  endLine: number
  text: string
}

// ── ContentPreview with git-diff-style comments ───────────────────

function ContentPreview({ singlePath, content, isStreaming }: { singlePath?: string; content: string; isStreaming?: boolean }) {
  const lines = content.split('\n')
  const total = lines.length
  const initialPreview = 30
  const loadMoreStep = 50

  const [visibleCount, setVisibleCount] = useState(Math.min(initialPreview, total))
  const lnWidth = String(total).length
  const remaining = total - visibleCount
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Esc to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFullscreen])

  // ── Selection state (click / shift+click on line numbers) ──
  const anchorRef = useRef<number | null>(null)
  const [selectedRange, setSelectedRange] = useState<{ start: number; end: number } | null>(null)

  // ── Composer state ──
  const [composerRange, setComposerRange] = useState<{ start: number; end: number } | null>(null)
  const [composerText, setComposerText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Comments ──
  const [comments, setComments] = useState<LineComment[]>([])
  const { sendMessage } = useConversationActions()

  // Set of lines covered by any comment
  const commentLineSet = useMemo(() => {
    const set = new Set<number>()
    for (const c of comments) {
      for (let i = c.startLine; i <= c.endLine; i++) set.add(i)
    }
    return set
  }, [comments])

  // ── Line number click handler ──
  const handleLineClick = useCallback((lineIndex: number, event: React.MouseEvent) => {
    const isShift = event.shiftKey

    if (isShift && anchorRef.current !== null) {
      // Shift+Click: extend selection from anchor
      const start = Math.min(anchorRef.current, lineIndex)
      const end = Math.max(anchorRef.current, lineIndex)
      setSelectedRange({ start, end })
      setComposerRange({ start, end })
      setComposerText(prev => prev) // keep existing text
    } else {
      // Normal click: new anchor, single line
      anchorRef.current = lineIndex
      const range = { start: lineIndex, end: lineIndex }
      setSelectedRange(range)
      setComposerRange(range)
      setComposerText('')
    }
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [])

  // ── Add comment ──
  const addComment = useCallback(() => {
    if (!composerRange || !composerText.trim()) return
    const comment: LineComment = {
      id: `${composerRange.start}-${composerRange.end}:${Date.now()}`,
      startLine: composerRange.start,
      endLine: composerRange.end,
      text: composerText.trim(),
    }
    setComments(prev => [...prev, comment].sort((a, b) => a.startLine - b.startLine))
    setComposerRange(null)
    setComposerText('')
    setSelectedRange(null)
  }, [composerRange, composerText])

  // ── Remove comment ──
  const removeComment = useCallback((id: string) => {
    setComments(prev => prev.filter(c => c.id !== id))
  }, [])

  // ── Send all comments ──
  const handleSendAll = useCallback(() => {
    if (comments.length === 0) return
    const filePath = singlePath ?? 'file'
    const parts = comments.map(c => {
      const snippet = lines.slice(c.startLine, c.endLine + 1).join('\n')
      const rangeLabel = c.startLine === c.endLine ? `L${c.startLine + 1}` : `L${c.startLine + 1}-${c.endLine + 1}`
      return `**${rangeLabel}**:\n\`\`\`\n${snippet}\n\`\`\`\n> ${c.text}`
    })
    const message = `📝 对 \`${filePath}\` 的 ${comments.length} 条评论：\n\n${parts.join('\n\n')}`
    sendMessage(message)
    setComments([])
    setComposerRange(null)
    setSelectedRange(null)
  }, [comments, singlePath, lines, sendMessage])

  // Find comment that ends on a given line (for inline rendering)
  const getCommentEndingAt = useCallback((lineIndex: number): LineComment | undefined => {
    return comments.find(c => c.endLine === lineIndex)
  }, [comments])

  return (
    <div className="px-3 py-2 space-y-2">
      {singlePath && (
        <div className="flex items-center gap-2">
          <div className="text-xs text-neutral-400 dark:text-neutral-500 font-mono truncate flex-1">{singlePath}</div>
          <button
            type="button"
            onClick={() => setIsFullscreen(true)}
            className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 transition-colors"
            title="全屏查看"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="rounded-md bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 overflow-hidden select-none">
        <div className="p-2 text-xs leading-5 font-mono">
          {lines.slice(0, visibleCount).map((line, i) => {
            const isSelected = selectedRange !== null && i >= selectedRange.start && i <= selectedRange.end
            const isCommented = commentLineSet.has(i)
            const commentEndingHere = getCommentEndingAt(i)
            const isComposerTarget = composerRange !== null && i >= composerRange.start && i <= composerRange.end

            return (
              <div key={i}>
                {/* Code line */}
                <div className="flex items-start group/line">
                  {/* Line number — clickable for selection */}
                  <span
                    onClick={e => handleLineClick(i, e)}
                    className={`shrink-0 text-right pr-3 cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                        : isCommented
                          ? 'text-amber-500 dark:text-amber-400 font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          : 'text-neutral-300 dark:text-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                    style={{ minWidth: lnWidth + 'ch' }}
                    title="点击选中行，Shift+点击多行选中"
                  >
                    {i + 1}
                  </span>
                  {/* Comment indicator */}
                  <span className="w-5 shrink-0 text-center">
                    {commentEndingHere && <MessageSquare className="inline h-2.5 w-2.5 text-amber-400 dark:text-amber-500" />}
                  </span>
                  {/* Line content */}
                  <span className={`whitespace-pre-wrap break-all min-w-0 ${
                    isSelected || isComposerTarget
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/15 dark:text-blue-300'
                      : isCommented
                        ? 'bg-amber-50/50 text-neutral-600 dark:bg-amber-950/10 dark:text-neutral-400'
                        : 'text-neutral-600 dark:text-neutral-400'
                  }`}>{line || '\u00A0'}</span>
                </div>

                {/* Inline comment preview — only on the last line of the range */}
                {commentEndingHere && !isComposerTarget && (
                  <div className="flex items-start gap-1 ml-6 pl-2 border-l-2 border-amber-300 dark:border-amber-600 py-0.5 mb-0.5">
                    {commentEndingHere.startLine !== commentEndingHere.endLine && (
                      <span className="text-[10px] text-amber-400 dark:text-amber-500 shrink-0">
                        L{commentEndingHere.startLine + 1}-{commentEndingHere.endLine + 1}
                      </span>
                    )}
                    <span className="text-[11px] text-amber-700 dark:text-amber-400 whitespace-pre-wrap break-all min-w-0 flex-1">
                      {commentEndingHere.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeComment(commentEndingHere.id)}
                      className="shrink-0 p-0.5 text-neutral-400 hover:text-red-500 transition-colors"
                      title="删除评论"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Inline composer — appears right below the selected range */}
                {isComposerTarget && composerRange && i === composerRange.end && (
                  <div className="ml-6 pl-2 border-l-2 border-blue-400 dark:border-blue-500 py-1.5 mb-0.5">
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquarePlus className="h-3 w-3 text-blue-500 shrink-0" />
                      <span className="text-[11px] font-medium text-blue-500 dark:text-blue-400 shrink-0">
                        {composerRange.start === composerRange.end
                          ? `L${composerRange.start + 1}`
                          : `L${composerRange.start + 1}-${composerRange.end + 1}`}
                      </span>
                      <div className="flex-1" />
                      <kbd className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 dark:border-neutral-600 dark:text-neutral-500">⌘↵</kbd>
                      <button
                        type="button"
                        onClick={() => { setComposerRange(null); setComposerText(''); setSelectedRange(null) }}
                        className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex items-start gap-2">
                      <textarea
                        ref={textareaRef}
                        value={composerText}
                        onChange={e => setComposerText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            setComposerRange(null)
                            setComposerText('')
                            setSelectedRange(null)
                          } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault()
                            addComment()
                          }
                        }}
                        placeholder="添加评论…"
                        autoFocus
                        rows={2}
                        className="min-h-[44px] flex-1 resize-none rounded border border-neutral-200 bg-white px-2 py-1 text-[13px] leading-snug text-neutral-800 outline-none focus:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={addComment}
                        disabled={!composerText.trim()}
                        className="mt-0.5 flex h-7 items-center rounded-md bg-neutral-900 px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-30 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                      >
                        添加
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {isStreaming && (
          <div className="border-t border-neutral-100 dark:border-neutral-800 px-2 py-1.5 flex items-center gap-1.5">
            <span className="inline-block h-2 w-0.5 bg-blue-500 animate-pulse" />
            <span className="text-[11px] text-neutral-400">写入中…</span>
          </div>
        )}
        {!isStreaming && remaining > 0 && (
          <div className="border-t border-neutral-100 dark:border-neutral-800 px-2 py-1.5 flex items-center justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount(Math.min(visibleCount + loadMoreStep, total))}
              className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
            >
              <ChevronDown className="h-3 w-3" />
              加载更多（剩余 {remaining} 行）
            </button>
          </div>
        )}
      </div>

      {/* Comments bar + actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {comments.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {comments.map(item => (
                  <div key={item.id} className="inline-flex items-center gap-1 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2 py-1 text-xs">
                    <span className="font-medium text-neutral-500 dark:text-neutral-400 shrink-0">
                      {item.startLine === item.endLine ? `L${item.startLine + 1}` : `L${item.startLine + 1}-${item.endLine + 1}`}
                    </span>
                    <span className="max-w-[200px] truncate text-neutral-600 dark:text-neutral-300" title={item.text}>{item.text}</span>
                    <button
                      className="text-neutral-400 hover:text-red-500 shrink-0"
                      onClick={() => removeComment(item.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSendAll}
                className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs bg-blue-500 text-white hover:bg-blue-600 transition-colors shrink-0"
              >
                <Send className="h-3 w-3" />
                发送 {comments.length} 条评论
              </button>
            </>
          )}
        </div>
        <CopyIconButton content={content} />
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setIsFullscreen(false)}
        >
          <div
            className="relative w-full max-w-5xl max-h-[90vh] rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-2xl flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
              <FilePlus className="h-4 w-4 text-neutral-400 shrink-0" />
              <span className="font-mono text-sm text-neutral-600 dark:text-neutral-300 truncate flex-1">{singlePath ?? 'file'}</span>
              <span className="text-xs text-neutral-400 shrink-0">{total} lines</span>
              {/* Fullscreen comments bar */}
              {comments.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-wrap gap-1.5">
                    {comments.map(item => (
                      <div key={item.id} className="inline-flex items-center gap-1 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-2 py-1 text-xs">
                        <span className="font-medium text-neutral-500 dark:text-neutral-400 shrink-0">
                          {item.startLine === item.endLine ? `L${item.startLine + 1}` : `L${item.startLine + 1}-${item.endLine + 1}`}
                        </span>
                        <span className="max-w-[160px] truncate text-neutral-600 dark:text-neutral-300" title={item.text}>{item.text}</span>
                        <button
                          className="text-neutral-400 hover:text-red-500 shrink-0"
                          onClick={() => removeComment(item.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleSendAll}
                    className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs bg-blue-500 text-white hover:bg-blue-600 transition-colors shrink-0"
                  >
                    <Send className="h-3 w-3" />
                    发送 {comments.length} 条评论
                  </button>
                </div>
              )}
              <CopyIconButton content={content} />
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="shrink-0 flex h-7 w-7 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 transition-colors"
                title="退出全屏 (Esc)"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
            {/* Code body — full interactive comment support */}
            <div className="flex-1 overflow-auto p-4 text-[13px] leading-5 font-mono select-none">
              {lines.map((line, i) => {
                const isSelected = selectedRange !== null && i >= selectedRange.start && i <= selectedRange.end
                const isCommented = commentLineSet.has(i)
                const commentEndingHere = getCommentEndingAt(i)
                const isComposerTarget = composerRange !== null && i >= composerRange.start && i <= composerRange.end

                return (
                  <div key={i}>
                    {/* Code line */}
                    <div className="flex items-start group/line">
                      {/* Line number — clickable */}
                      <span
                        onClick={e => handleLineClick(i, e)}
                        className={`shrink-0 text-right pr-4 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                            : isCommented
                              ? 'text-amber-500 dark:text-amber-400 font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800'
                              : 'text-neutral-300 dark:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                        }`}
                        style={{ minWidth: lnWidth + 'ch' }}
                        title="点击选中行，Shift+点击多行选中"
                      >
                        {i + 1}
                      </span>
                      {/* Comment indicator */}
                      <span className="w-5 shrink-0 text-center">
                        {commentEndingHere && <MessageSquare className="inline h-2.5 w-2.5 text-amber-400 dark:text-amber-500" />}
                      </span>
                      {/* Line content */}
                      <span className={`whitespace-pre-wrap break-all min-w-0 ${
                        isSelected || isComposerTarget
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/15 dark:text-blue-300'
                          : isCommented
                            ? 'bg-amber-50/50 text-neutral-600 dark:bg-amber-950/10 dark:text-neutral-400'
                            : 'text-neutral-600 dark:text-neutral-400'
                      }`}>{line || '\u00A0'}</span>
                    </div>

                    {/* Inline comment preview with delete */}
                    {commentEndingHere && !isComposerTarget && (
                      <div className="flex items-start gap-1 ml-6 pl-2 border-l-2 border-amber-300 dark:border-amber-600 py-0.5 mb-0.5">
                        {commentEndingHere.startLine !== commentEndingHere.endLine && (
                          <span className="text-[10px] text-amber-400 dark:text-amber-500 shrink-0">
                            L{commentEndingHere.startLine + 1}-{commentEndingHere.endLine + 1}
                          </span>
                        )}
                        <span className="text-[11px] text-amber-700 dark:text-amber-400 whitespace-pre-wrap break-all min-w-0 flex-1">
                          {commentEndingHere.text}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeComment(commentEndingHere.id)}
                          className="shrink-0 p-0.5 text-neutral-400 hover:text-red-500 transition-colors"
                          title="删除评论"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}

                    {/* Inline composer */}
                    {isComposerTarget && composerRange && i === composerRange.end && (
                      <div className="ml-6 pl-2 border-l-2 border-blue-400 dark:border-blue-500 py-1.5 mb-0.5">
                        <div className="flex items-center gap-2 mb-1">
                          <MessageSquarePlus className="h-3 w-3 text-blue-500 shrink-0" />
                          <span className="text-[11px] font-medium text-blue-500 dark:text-blue-400 shrink-0">
                            {composerRange.start === composerRange.end
                              ? `L${composerRange.start + 1}`
                              : `L${composerRange.start + 1}-${composerRange.end + 1}`}
                          </span>
                          <div className="flex-1" />
                          <kbd className="shrink-0 rounded border border-neutral-200 px-1 text-[10px] text-neutral-400 dark:border-neutral-600 dark:text-neutral-500">⌘↵</kbd>
                          <button
                            type="button"
                            onClick={() => { setComposerRange(null); setComposerText(''); setSelectedRange(null) }}
                            className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex items-start gap-2">
                          <textarea
                            value={composerText}
                            onChange={e => setComposerText(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Escape') {
                                setComposerRange(null)
                                setComposerText('')
                                setSelectedRange(null)
                              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault()
                                addComment()
                              }
                            }}
                            placeholder="添加评论…"
                            autoFocus
                            rows={2}
                            className="min-h-[44px] flex-1 resize-none rounded border border-neutral-200 bg-white px-2 py-1 text-[13px] leading-snug text-neutral-800 outline-none focus:border-blue-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:focus:border-blue-500"
                          />
                          <button
                            type="button"
                            onClick={addComment}
                            disabled={!composerText.trim()}
                            className="mt-0.5 flex h-7 items-center rounded-md bg-neutral-900 px-2.5 text-[12px] font-medium text-white transition-colors hover:bg-neutral-700 disabled:opacity-30 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                          >
                            添加
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function shortPath(p: string): string {
  const parts = p.split('/')
  return parts.length > 3 ? '...' + parts.slice(-3).join('/') : p
}

function StreamingPlaceholder() {
  return (
    <div className="px-3 py-2">
      <div className="space-y-1.5">
        {[50, 65, 45, 55, 40].map((w, i) => (
          <div key={i} className="h-3 rounded bg-neutral-100 dark:bg-neutral-800" style={{ width: w + '%' }} />
        ))}
      </div>
    </div>
  )
}
