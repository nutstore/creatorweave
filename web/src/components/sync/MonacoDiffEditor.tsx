import { DiffEditor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { useEffect, useMemo, useRef, useState } from 'react'

let loaderConfigured = false

function ensureMonacoLoaderConfigured(): void {
  if (loaderConfigured) return
  loader.config({ monaco })
  loaderConfigured = true
}

function languageFromPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.ts')) return 'typescript'
  if (lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js')) return 'javascript'
  if (lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.html')) return 'html'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.scss')) return 'scss'
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.java')) return 'java'
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml'
  return 'plaintext'
}

export type DiffCommentTarget = {
  side: 'original' | 'modified'
  startLine: number
  endLine: number
  anchorClientX?: number
  anchorClientY?: number
}

interface LineComment {
  side: 'original' | 'modified'
  startLine: number
  endLine: number
}

interface MonacoDiffEditorProps {
  original: string
  modified: string
  path: string
  comments?: LineComment[]
  selectedTarget?: DiffCommentTarget | null
  onLineSelectForComment?: (target: DiffCommentTarget) => void
  renderSideBySide?: boolean
}

type DragSelectionState = {
  dragging: boolean
  anchorLine: number
  anchorClientX?: number
  anchorClientY?: number
}

export default function MonacoDiffEditor({
  original,
  modified,
  path,
  comments = [],
  selectedTarget = null,
  onLineSelectForComment,
  renderSideBySide = false,
}: MonacoDiffEditorProps) {
  ensureMonacoLoaderConfigured()

  const language = useMemo(() => languageFromPath(path), [path])
  const [isDark, setIsDark] = useState(
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  )

  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)
  const originalMouseDisposableRef = useRef<monaco.IDisposable | null>(null)
  const modifiedMouseDisposableRef = useRef<monaco.IDisposable | null>(null)
  const originalDecorationIdsRef = useRef<string[]>([])
  const modifiedDecorationIdsRef = useRef<string[]>([])
  const originalDragSelectionRef = useRef<DragSelectionState | null>(null)
  const modifiedDragSelectionRef = useRef<DragSelectionState | null>(null)

  useEffect(() => {
    originalDragSelectionRef.current = null
    modifiedDragSelectionRef.current = null
  }, [path])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    const updateTheme = () => setIsDark(root.classList.contains('dark'))

    updateTheme()

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          updateTheme()
          break
        }
      }
    })
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const diffEditor = diffEditorRef.current
    const monacoNs = monacoRef.current
    if (!diffEditor || !monacoNs) return

    const originalEditor = diffEditor.getOriginalEditor()
    const modifiedEditor = diffEditor.getModifiedEditor()

    const originalDecorations = comments
      .filter((item) => item.side === 'original')
      .map((item) => ({
        range: new monacoNs.Range(item.startLine, 1, item.endLine, 1),
        options: {
          isWholeLine: true,
          className: 'cw-commented-line',
          glyphMarginClassName: 'cw-comment-glyph',
          linesDecorationsClassName: 'cw-comment-line-decoration',
          lineNumberClassName: 'cw-comment-line-number',
          glyphMarginHoverMessage: { value: '该行有评论' },
          lineNumberHoverMessage: { value: '该行有评论' },
        },
      }))

    const modifiedDecorations = comments
      .filter((item) => item.side === 'modified')
      .map((item) => ({
        range: new monacoNs.Range(item.startLine, 1, item.endLine, 1),
        options: {
          isWholeLine: true,
          className: 'cw-commented-line',
          glyphMarginClassName: 'cw-comment-glyph',
          linesDecorationsClassName: 'cw-comment-line-decoration',
          lineNumberClassName: 'cw-comment-line-number',
          glyphMarginHoverMessage: { value: '该行有评论' },
          lineNumberHoverMessage: { value: '该行有评论' },
        },
      }))

    const originalSelectionDecoration =
      selectedTarget?.side === 'original'
        ? [
            {
              range: new monacoNs.Range(selectedTarget.startLine, 1, selectedTarget.endLine, 1),
              options: {
                isWholeLine: true,
                className: 'cw-comment-selection-line',
                linesDecorationsClassName: 'cw-comment-selection-decoration',
                lineNumberClassName: 'cw-comment-selection-line-number',
              },
            },
          ]
        : []

    const modifiedSelectionDecoration =
      selectedTarget?.side === 'modified'
        ? [
            {
              range: new monacoNs.Range(selectedTarget.startLine, 1, selectedTarget.endLine, 1),
              options: {
                isWholeLine: true,
                className: 'cw-comment-selection-line',
                linesDecorationsClassName: 'cw-comment-selection-decoration',
                lineNumberClassName: 'cw-comment-selection-line-number',
              },
            },
          ]
        : []

    originalDecorationIdsRef.current = originalEditor.deltaDecorations(
      originalDecorationIdsRef.current,
      [...originalDecorations, ...originalSelectionDecoration]
    )
    modifiedDecorationIdsRef.current = modifiedEditor.deltaDecorations(
      modifiedDecorationIdsRef.current,
      [...modifiedDecorations, ...modifiedSelectionDecoration]
    )
  }, [comments, selectedTarget])

  useEffect(() => {
    return () => {
      originalMouseDisposableRef.current?.dispose()
      modifiedMouseDisposableRef.current?.dispose()
      const diffEditor = diffEditorRef.current
      if (diffEditor) {
        diffEditor.getOriginalEditor().deltaDecorations(originalDecorationIdsRef.current, [])
        diffEditor.getModifiedEditor().deltaDecorations(modifiedDecorationIdsRef.current, [])
      }
    }
  }, [])

  const theme = isDark ? 'vs-dark' : 'vs'

  return (
    <div className="cw-commentable-diff h-full w-full" data-testid="monaco-diff-editor">
      <DiffEditor
        height="100%"
        language={language}
        original={original}
        modified={modified}
        theme={theme}
        onMount={(editor, monacoNs) => {
          diffEditorRef.current = editor
          monacoRef.current = monacoNs

          const bindMouse = (
            targetEditor: monaco.editor.ICodeEditor,
            side: 'original' | 'modified'
          ): monaco.IDisposable => {
            const dragSelectionRef = side === 'original' ? originalDragSelectionRef : modifiedDragSelectionRef
            const isGutterTarget = (targetType: monaco.editor.MouseTargetType): boolean => (
              targetType === monacoNs.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
              targetType === monacoNs.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
              targetType === monacoNs.editor.MouseTargetType.GUTTER_LINE_DECORATIONS
            )

            const mouseDownDisposable = targetEditor.onMouseDown((event) => {
              const targetType = event.target.type
              if (!isGutterTarget(targetType)) return
              const line = event.target.position?.lineNumber
              if (!line) return
              const browserEvent = event.event.browserEvent as MouseEvent | undefined
              const isShift = browserEvent?.shiftKey === true

              const prev = dragSelectionRef.current

              if (isShift && prev) {
                // Shift+click: extend selection from anchor line
                const startLine = Math.min(prev.anchorLine, line)
                const endLine = Math.max(prev.anchorLine, line)
                onLineSelectForComment?.({
                  side,
                  startLine,
                  endLine,
                  anchorClientX: prev.anchorClientX,
                  anchorClientY: prev.anchorClientY,
                })
              } else {
                // Normal click: set new anchor
                dragSelectionRef.current = {
                  dragging: false,
                  anchorLine: line,
                  anchorClientX: browserEvent?.clientX,
                  anchorClientY: browserEvent?.clientY,
                }
                onLineSelectForComment?.({
                  side,
                  startLine: line,
                  endLine: line,
                  anchorClientX: browserEvent?.clientX,
                  anchorClientY: browserEvent?.clientY,
                })
              }
            })

            // No mouseMove/mouseUp needed for shift+click mode
            const mouseMoveDisposable = { dispose: () => {} }
            const mouseUpDisposable = { dispose: () => {} }

            return {
              dispose: () => {
                mouseDownDisposable.dispose()
                mouseMoveDisposable.dispose()
                mouseUpDisposable.dispose()
              },
            }
          }

          originalMouseDisposableRef.current?.dispose()
          modifiedMouseDisposableRef.current?.dispose()
          originalMouseDisposableRef.current = bindMouse(editor.getOriginalEditor(), 'original')
          modifiedMouseDisposableRef.current = bindMouse(editor.getModifiedEditor(), 'modified')
        }}
        options={{
          readOnly: true,
          automaticLayout: true,
          renderSideBySide: renderSideBySide,
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
          wordWrap: 'on',
          diffWordWrap: 'on',
          renderOverviewRuler: false,
          glyphMargin: true,
          lineDecorationsWidth: 8,
        }}
      />
    </div>
  )
}
