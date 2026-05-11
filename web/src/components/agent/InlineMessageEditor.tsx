/**
 * InlineMessageEditor — a rich-text editor for editing existing user messages.
 *
 * Powered by TipTap (same as AgentRichInput) so the editing experience is
 * consistent with the bottom input:
 *   - @ agent mentions
 *   - # file mentions
 *   - File upload + preview (local state, isolated from main composer)
 *   - Enter to submit, Escape to cancel
 */

import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import History from '@tiptap/extension-history'
import Mention from '@tiptap/extension-mention'
import { FileMention, type FileMentionItem } from './FileMentionExtension'
import { Paperclip, X, ImageIcon, FileIcon, FolderIcon } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentMentionCandidate {
  id: string
  name?: string
}

interface LocalPendingAsset {
  id: string
  name: string
  size: number
  previewUrl: string | null
}

export interface InlineMessageEditorProps {
  /** Initial text content (the original message content) */
  initialContent: string
  /** Agent candidates for @ mention */
  agents: AgentMentionCandidate[]
  /** Async file search callback for # file mention */
  onSearchFiles?: (query: string) => Promise<FileMentionItem[]>
  /** Submit callback — receives the new plain-text content */
  onSubmit: (text: string) => void
  /** Cancel callback */
  onCancel: () => void
  /** Cancel button label */
  cancelLabel: string
  /** Submit button label */
  submitLabel: string
}

// ---------------------------------------------------------------------------
// Suggestion dropdown (shared with AgentRichInput — duplicated here for
// independence so MessageBubble doesn't need to import from AgentRichInput)
// ---------------------------------------------------------------------------

interface SuggestionDropdownHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

interface SuggestionDropdownProps<T> {
  items: T[]
  getItemKey: (item: T) => string
  onSelect: (item: T) => void
  renderItem: (item: T, isSelected: boolean) => React.ReactNode
  width?: string
  selectedColor?: string
}

const SuggestionDropdown = forwardRef(
  function SuggestionDropdown<T>(
    {
      items,
      getItemKey,
      onSelect,
      renderItem,
      width = 'w-72',
      selectedColor = 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
    }: SuggestionDropdownProps<T>,
    ref: React.Ref<SuggestionDropdownHandle>,
  ) {
    const [selectedIndex, setSelectedIndex] = useState(0)
    const selectedRef = useRef(0)

    const selectItem = useCallback(
      (index: number) => {
        const item = items[index]
        if (item) onSelect(item)
      },
      [items, onSelect],
    )

    useEffect(() => {
      setSelectedIndex(0)
      selectedRef.current = 0
    }, [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((idx) => {
            const next = Math.max(0, idx - 1)
            selectedRef.current = next
            return next
          })
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((idx) => {
            const max = Math.max(items.length - 1, 0)
            const next = idx >= max ? max : idx + 1
            selectedRef.current = next
            return next
          })
          return true
        }
        if (event.key === 'Enter') {
          if (items.length === 0) return true
          selectItem(selectedRef.current)
          return true
        }
        return false
      },
    }))

    if (items.length === 0) return null

    return (
      <div
        className={`absolute bottom-full left-0 z-20 mb-2 ${width} overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900`}
      >
        <div className="max-h-56 overflow-y-auto py-1">
          {items.map((item, idx) => {
            const selected = idx === selectedIndex
            return (
              <button
                key={getItemKey(item)}
                type="button"
                className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  selected
                    ? selectedColor
                    : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectItem(idx)
                }}
              >
                {renderItem(item, selected)}
              </button>
            )
          })}
        </div>
      </div>
    )
  },
) as <T>(
  props: SuggestionDropdownProps<T> & { ref?: React.Ref<SuggestionDropdownHandle> },
) => React.ReactElement | null

// ---------------------------------------------------------------------------
// Helpers — extract plain text & mention IDs from editor document
// ---------------------------------------------------------------------------

function getPlainText(editor: Editor): string {
  const { doc } = editor.state
  const lines: string[] = []
  let lineBuf = ''

  doc.descendants((node) => {
    if (node.isText) {
      lineBuf += node.text ?? ''
    } else if (node.type.name === 'mention') {
      const id = node.attrs.id ?? ''
      if (id && lineBuf.length > 0 && !/[\s\n]$/.test(lineBuf)) {
        lineBuf += ' '
      }
      lineBuf += `@${id}`
    } else if (node.type.name === 'fileMention') {
      const path = node.attrs.path ?? ''
      if (path && lineBuf.length > 0 && !/[\s\n]$/.test(lineBuf)) {
        lineBuf += ' '
      }
      lineBuf += `#${path}`
    } else if (node.type.name === 'hardBreak') {
      lineBuf += '\n'
    } else if (node.type.isBlock && lineBuf) {
      lines.push(lineBuf)
      lineBuf = ''
    }
  })
  if (lineBuf) lines.push(lineBuf)
  return lines.join('\n')
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// InlineMessageEditor
// ---------------------------------------------------------------------------

export function InlineMessageEditor({
  initialContent,
  agents,
  onSearchFiles,
  onSubmit,
  onCancel,
  cancelLabel,
  submitLabel,
}: InlineMessageEditorProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [pendingAssets, setPendingAssets] = useState<LocalPendingAsset[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Suggestion state – @ agent mention
  const [suggestionItems, setSuggestionItems] = useState<AgentMentionCandidate[]>([])
  const [suggestionCommand, setSuggestionCommand] = useState<((item: { id: string }) => void) | null>(null)
  const suggestionDropdownRef = useRef<SuggestionDropdownHandle>(null)

  // File suggestion state – # file mention
  const [fileSuggestionItems, setFileSuggestionItems] = useState<FileMentionItem[]>([])
  const [fileSuggestionCommand, setFileSuggestionCommand] = useState<((item: FileMentionItem) => void) | null>(null)
  const fileSuggestionDropdownRef = useRef<SuggestionDropdownHandle>(null)
  const fileSuggestionItemsRef = useRef<FileMentionItem[]>([])
  const fileSuggestionCommandRef = useRef<((item: FileMentionItem) => void) | null>(null)
  useEffect(() => { fileSuggestionItemsRef.current = fileSuggestionItems }, [fileSuggestionItems])
  useEffect(() => { fileSuggestionCommandRef.current = fileSuggestionCommand }, [fileSuggestionCommand])
  const fileSuggestionRangeRef = useRef<{ from: number; to: number } | null>(null)
  const fileSuggestionEditorRef = useRef<Editor | null>(null)

  const onCancelRef = useRef(onCancel)
  const onSubmitRef = useRef(onSubmit)
  useEffect(() => { onCancelRef.current = onCancel }, [onCancel])
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])

  const agentsRef = useRef(agents)
  useEffect(() => { agentsRef.current = agents }, [agents])

  const handleFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setPendingAssets((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      })),
    ])
  }, [])

  const removePendingAsset = useCallback((id: string) => {
    setPendingAssets((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const clearPendingAssets = useCallback(() => {
    setPendingAssets((prev) => {
      for (const asset of prev) {
        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl)
      }
      return []
    })
  }, [])

  useEffect(() => {
    return () => {
      for (const asset of pendingAssets) {
        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl)
      }
    }
  }, [pendingAssets])

  // ---- editor -------------------------------------------------------------
  const editor = useEditor({
    immediatelyRender: false,
    editable: true,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      History,
      Mention.configure({
        HTMLAttributes: {
          class:
            'inline-flex items-center rounded px-1.5 py-0.5 bg-primary-100 text-primary-800 text-sm font-medium dark:bg-primary-900/60 dark:text-primary-200',
        },
        suggestion: {
          char: '@',
          items: ({ query }) => {
            const q = query.toLowerCase().trim()
            return agentsRef.current
              .filter((a) => a.id !== 'default')
              .filter((a) => {
                if (!q) return true
                const haystack = `${a.id} ${a.name || ''}`.toLowerCase()
                return haystack.includes(q)
              })
              .slice(0, 8)
          },
          render: () => ({
            onStart: (props) => {
              setSuggestionItems(props.items as AgentMentionCandidate[])
              setSuggestionCommand(() => props.command)
            },
            onUpdate: (props) => {
              setSuggestionItems(props.items as AgentMentionCandidate[])
              setSuggestionCommand(() => props.command)
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                setSuggestionItems([])
                setSuggestionCommand(null)
                return true
              }
              return suggestionDropdownRef.current?.onKeyDown(props.event) ?? false
            },
            onExit: () => {
              setSuggestionItems([])
              setSuggestionCommand(null)
            },
          }),
          command: ({ editor: e, range, props }) => {
            e
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: 'mention', attrs: { id: props.id } },
                { type: 'text', text: ' ' },
              ])
              .run()
          },
        },
      }),
      ...(onSearchFiles
        ? [
            FileMention.configure({
              onSearch: onSearchFiles,
              render: () => {
                let activeIdx = 0
                const selectFile = (item: FileMentionItem) => {
                  const range = fileSuggestionRangeRef.current
                  const editorInstance = fileSuggestionEditorRef.current
                  if (range && editorInstance) {
                    editorInstance
                      .chain()
                      .focus()
                      .insertContentAt(range, [
                        {
                          type: 'fileMention',
                          attrs: { path: item.path, name: item.name, extension: item.extension ?? '' },
                        },
                        { type: 'text', text: ' ' },
                      ])
                      .run()
                  }
                  setFileSuggestionItems([])
                  setFileSuggestionCommand(null)
                  fileSuggestionItemsRef.current = []
                  fileSuggestionCommandRef.current = null
                  fileSuggestionRangeRef.current = null
                  fileSuggestionEditorRef.current = null
                }
                return {
                  onStart: async (props) => {
                    const items = await (props.items as Promise<FileMentionItem[]> | FileMentionItem[])
                    setFileSuggestionItems(items as FileMentionItem[])
                    setFileSuggestionCommand(() => selectFile)
                    fileSuggestionItemsRef.current = items as FileMentionItem[]
                    fileSuggestionCommandRef.current = selectFile
                    activeIdx = 0
                    fileSuggestionRangeRef.current = props.range
                    fileSuggestionEditorRef.current = props.editor
                  },
                  onUpdate: async (props) => {
                    const items = await (props.items as Promise<FileMentionItem[]> | FileMentionItem[])
                    setFileSuggestionItems(items as FileMentionItem[])
                    setFileSuggestionCommand(() => selectFile)
                    fileSuggestionItemsRef.current = items as FileMentionItem[]
                    fileSuggestionCommandRef.current = selectFile
                    activeIdx = 0
                    fileSuggestionRangeRef.current = props.range
                    fileSuggestionEditorRef.current = props.editor
                  },
                  onKeyDown: (props) => {
                    if (props.event.key === 'Escape') {
                      setFileSuggestionItems([])
                      setFileSuggestionCommand(null)
                      fileSuggestionItemsRef.current = []
                      fileSuggestionCommandRef.current = null
                      return true
                    }
                    const dropdownResult = fileSuggestionDropdownRef.current?.onKeyDown(props.event)
                    if (dropdownResult) return true
                    const items = fileSuggestionItemsRef.current
                    if (items.length === 0) return false
                    if (props.event.key === 'ArrowUp') {
                      activeIdx = Math.max(0, activeIdx - 1)
                      return true
                    }
                    if (props.event.key === 'ArrowDown') {
                      activeIdx = Math.min(items.length - 1, activeIdx + 1)
                      return true
                    }
                    if (props.event.key === 'Enter') {
                      const item = items[activeIdx]
                      if (item) {
                        const cmd = fileSuggestionCommandRef.current
                        if (cmd) cmd(item)
                      }
                      return true
                    }
                    return false
                  },
                  onExit: () => {
                    setFileSuggestionItems([])
                    setFileSuggestionCommand(null)
                    fileSuggestionItemsRef.current = []
                    fileSuggestionCommandRef.current = null
                  },
                }
              },
            }),
          ]
        : []),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          'min-h-[36px] max-h-[160px] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (event.isComposing) return false

        if (event.key === 'Enter' && !event.shiftKey) {
          // If file suggestion is showing, delegate to dropdown
          const fileItems = fileSuggestionItemsRef.current
          if (fileItems.length > 0) {
            const handled = fileSuggestionDropdownRef.current?.onKeyDown(event) ?? false
            if (handled) return true
            const cmd = fileSuggestionCommandRef.current
            if (cmd) {
              cmd(fileItems[0])
              return true
            }
          }
          event.preventDefault()
          const text = editor ? getPlainText(editor) : ''
          onSubmitRef.current(text)
          return true
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancelRef.current()
          return true
        }
        return false
      },
    },
  })

  // Focus editor on mount, move cursor to end
  useEffect(() => {
    if (editor) {
      editor.commands.focus('end')
    }
  }, [editor])

  const handleSubmit = () => {
    if (!editor) return
    const text = getPlainText(editor)
    clearPendingAssets()
    onSubmit(text)
  }

  const currentText = editor ? getPlainText(editor).trim() : ''
  const canSubmit = currentText.length > 0
  const showSuggestion = suggestionItems.length > 0 && !!suggestionCommand
  const showFileSuggestion = fileSuggestionItems.length > 0 && !!fileSuggestionCommand

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleCancel = () => {
    clearPendingAssets()
    onCancel()
  }

  return (
    <div
      className="relative w-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary-400 bg-primary-50/80 dark:bg-primary-900/30">
          <div className="flex flex-col items-center gap-1 text-primary-600 dark:text-primary-300">
            <Paperclip className="h-8 w-8" />
            <span className="text-sm font-medium">Drop files here</span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />

      {/* Editor container — adapted from AgentRichInput but slightly more compact */}
      <div className="relative w-full rounded-xl border border-neutral-300 bg-white pl-11 pr-3 py-3 text-sm text-neutral-900 shadow-sm transition-colors focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-within:border-primary-500">
        {editor && (
          <>
            <EditorContent editor={editor} />
            {pendingAssets.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {pendingAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="group relative flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    {asset.previewUrl ? (
                      <img
                        src={asset.previewUrl}
                        alt={asset.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-neutral-200 dark:bg-neutral-700">
                        <ImageIcon className="h-4 w-4 text-neutral-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="max-w-[140px] truncate text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        {asset.name}
                      </div>
                      <div className="text-[10px] text-neutral-400">
                        {formatFileSize(asset.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-200 dark:hover:bg-neutral-600"
                      onClick={() => removePendingAsset(asset.id)}
                      aria-label={`Remove ${asset.name}`}
                    >
                      <X className="h-3.5 w-3.5 text-neutral-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute left-3 top-4 rounded p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          title="Attach files"
        >
          <Paperclip className="h-4 w-4" />
        </button>
      </div>

      {/* Action buttons — right-aligned below editor */}
      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>

      {/* Mention suggestions dropdown */}
      {showSuggestion && suggestionCommand && (
        <SuggestionDropdown<AgentMentionCandidate>
          ref={suggestionDropdownRef}
          items={suggestionItems}
          getItemKey={(c) => c.id}
          onSelect={(c) => suggestionCommand?.({ id: c.id })}
          renderItem={(candidate) => (
            <>
              <span className="font-medium">@{candidate.id}</span>
              {candidate.name && candidate.name !== candidate.id && (
                <span className="truncate pl-3 text-xs text-neutral-500 dark:text-neutral-400">
                  {candidate.name}
                </span>
              )}
            </>
          )}
        />
      )}

      {/* File suggestions dropdown */}
      {showFileSuggestion && fileSuggestionCommand && (
        <SuggestionDropdown<FileMentionItem>
          ref={fileSuggestionDropdownRef}
          items={fileSuggestionItems}
          getItemKey={(f) => f.path}
          onSelect={(f) => fileSuggestionCommand?.(f)}
          width="w-[26rem]"
          selectedColor="bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200"
          renderItem={(file) => (
            <>
              <span className="mt-0.5 shrink-0 text-neutral-400 dark:text-neutral-500">
                {file.isDirectory ? (
                  <FolderIcon className="h-3.5 w-3.5" />
                ) : (
                  <FileIcon className="h-3.5 w-3.5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium leading-5">{file.name}</div>
                <div className="truncate text-[11px] leading-4 text-neutral-400 dark:text-neutral-500">
                  {file.path}{file.isDirectory ? '/' : ''}
                </div>
              </div>
              {!file.isDirectory && file.extension && (
                <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                  .{file.extension}
                </span>
              )}
            </>
          )}
        />
      )}
    </div>
  )
}
